// 오프라인 보상 EMA 정산 (Step 2 — spec: last-story-offline-rewards-redesign-spec.md)
//
// 동작 원칙:
//  1) characters.last_offline_at 이 set 되어 있으면 정산 대상.
//  2) (NOW - last_offline_at) * online_*_rate * MULT 로 EXP/골드/킬/드랍 산정.
//  3) total_kills < 100 이거나 EMA 0 이면 보상 0 (표본 부족).
//  4) 드랍은 last_field_id_offline 의 monster_pool 합산 가중치로 N개 추첨.
//  5) 트랜잭션으로 일괄 적용 + last_offline_at = NULL, last_offline_settled_at = NOW().
//  6) 멱등: 같은 캐릭에 대한 동시 호출은 SELECT FOR UPDATE 로 직렬화.
//
// Step 2 시점에선 호출만 추가됨. 오프라인 시뮬은 살아 있어 last_offline_at 가 set 되지
// 않으므로 실제 정산은 발생하지 않음 (안전 dry-run). Step 3 에서 onSessionGoOffline
// 추가 시점부터 활성화.

import { query, pool } from '../db/pool.js';
import { applyExpGain } from '../game/leveling.js';
import { addItemToInventory, type EquipPreroll } from '../game/inventory.js';
import { getItemDef } from '../game/contentCache.js';

// EMA 는 100ms tick 실측 기반이라 자체 효율 100%.
// 시뮬 시절의 1.4 보정(자연효율 68% → 95%)을 그대로 적용하면 +40% 오버 인플레이션.
// "딱 사냥속도에 맞게" 원칙 → 1.0 (정확 환산).
const MULT = 1.0;
const OFFLINE_CAP_SEC = 8 * 60 * 60;        // 8시간 상한
const MIN_ELAPSED_SEC = 60;                 // 1분 미만은 스킵 (노이즈)
const MIN_TOTAL_KILLS = 300;                // 표본 기준 — 100 은 1~2분 만에 채워지는 신규 캐릭이 들쭉날쭉 EMA 로 8h 정산받는 문제로 300 으로 상향
const MAX_DROP_COUNT = 50000;               // 드랍 추첨 폭주 가드
const DROP_RATE_MULT = 0.1;                 // engine.ts 와 동일 (비유니크 기본 배율)

export interface OfflineRewardResult {
  applied: boolean;                          // 실제 보상 지급 여부
  reason?: 'no_offline' | 'insufficient_kills' | 'too_short' | 'no_field';
  elapsedSec?: number;
  expGain?: number;
  goldGain?: number;
  killsInc?: number;
  drops?: { itemId: number; qty: number; itemName?: string }[];
  newLevel?: number;
  levelsGained?: number;
}

interface CharRates {
  id: number;
  level: number;
  exp: number;
  class_name: string;
  total_kills: number;
  online_exp_rate: number;
  online_gold_rate: number;
  online_kill_rate: number;
  online_drop_rate: number;
  last_offline_at: string | null;
  last_field_id_offline: number | null;
}

// 필드 드랍 풀 캐시 — fields.monster_pool 의 모든 몬스터의 drop_table 을 합산.
// 가중치 = chance * (1/pool_size) * (uniq ? 1 : DROP_RATE_MULT) * avg_qty.
// 60초 TTL.
interface FieldDropPool {
  items: { itemId: number; weight: number; minQty: number; maxQty: number; isUnique: boolean }[];
  totalWeight: number;
  loadedAt: number;
}
const fieldDropPoolCache = new Map<number, FieldDropPool>();
const FIELD_POOL_TTL = 60_000;

let uniqueIdSet: Set<number> | null = null;
async function getUniqueIds(): Promise<Set<number>> {
  if (uniqueIdSet) return uniqueIdSet;
  const r = await query<{ id: number }>("SELECT id FROM items WHERE grade = 'unique'");
  uniqueIdSet = new Set(r.rows.map(x => x.id));
  return uniqueIdSet;
}

async function getFieldDropPool(fieldId: number): Promise<FieldDropPool | null> {
  const cached = fieldDropPoolCache.get(fieldId);
  if (cached && Date.now() - cached.loadedAt < FIELD_POOL_TTL) return cached;

  const fr = await query<{ monster_pool: number[] }>(
    'SELECT monster_pool FROM fields WHERE id = $1', [fieldId]
  );
  if (fr.rowCount === 0 || !fr.rows[0].monster_pool || fr.rows[0].monster_pool.length === 0) {
    return null;
  }
  const monsterIds: number[] = fr.rows[0].monster_pool;
  const mr = await query<{ id: number; drop_table: { itemId: number; chance: number; minQty: number; maxQty: number }[] }>(
    `SELECT id, drop_table FROM monsters WHERE id = ANY($1::int[])`,
    [monsterIds]
  );
  const uniques = await getUniqueIds();
  // 합산: 몬스터별 균등 등장 가정 (1/pool_size) × drop_chance × 비유니크 배율
  const aggMap = new Map<number, { weight: number; minQty: number; maxQty: number; isUnique: boolean }>();
  const perMonsterShare = 1 / monsterIds.length;
  for (const row of mr.rows) {
    const dt = row.drop_table || [];
    for (const d of dt) {
      const isUnique = uniques.has(d.itemId);
      const rateMult = isUnique ? 1.0 : DROP_RATE_MULT;
      const w = perMonsterShare * d.chance * rateMult;
      const cur = aggMap.get(d.itemId);
      if (cur) {
        cur.weight += w;
        cur.minQty = Math.min(cur.minQty, d.minQty);
        cur.maxQty = Math.max(cur.maxQty, d.maxQty);
      } else {
        aggMap.set(d.itemId, { weight: w, minQty: d.minQty, maxQty: d.maxQty, isUnique });
      }
    }
  }
  const items = [...aggMap.entries()].map(([itemId, v]) => ({ itemId, ...v }));
  const totalWeight = items.reduce((s, x) => s + x.weight, 0);
  const pool: FieldDropPool = { items, totalWeight, loadedAt: Date.now() };
  if (totalWeight > 0) fieldDropPoolCache.set(fieldId, pool);
  return totalWeight > 0 ? pool : null;
}

// N개 슬롯 가중 추첨. itemId 별 qty 합산.
async function sampleDropsFromField(fieldId: number, n: number): Promise<{ itemId: number; qty: number }[]> {
  if (n <= 0) return [];
  const pool = await getFieldDropPool(fieldId);
  if (!pool || pool.totalWeight <= 0) return [];
  const cap = Math.min(n, MAX_DROP_COUNT);
  const out = new Map<number, number>();
  for (let i = 0; i < cap; i++) {
    const r = Math.random() * pool.totalWeight;
    let acc = 0;
    for (const item of pool.items) {
      acc += item.weight;
      if (r <= acc) {
        const qty = item.minQty + Math.floor(Math.random() * (item.maxQty - item.minQty + 1));
        if (qty > 0) out.set(item.itemId, (out.get(item.itemId) ?? 0) + qty);
        break;
      }
    }
  }
  return [...out.entries()].map(([itemId, qty]) => ({ itemId, qty }));
}

export async function settleOfflineRewards(charId: number): Promise<OfflineRewardResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 1) row lock + 현재 상태 조회
    const r = await client.query<CharRates>(
      `SELECT id, level, exp, class_name, total_kills,
              COALESCE(online_exp_rate, 0)::float8  AS online_exp_rate,
              COALESCE(online_gold_rate, 0)::float8 AS online_gold_rate,
              COALESCE(online_kill_rate, 0)::float8 AS online_kill_rate,
              COALESCE(online_drop_rate, 0)::float8 AS online_drop_rate,
              last_offline_at, last_field_id_offline
         FROM characters WHERE id = $1 FOR UPDATE`,
      [charId]
    );
    if (r.rowCount === 0 || !r.rows[0].last_offline_at) {
      await client.query('ROLLBACK');
      return { applied: false, reason: 'no_offline' };
    }
    const c = r.rows[0];
    const elapsedMs = Date.now() - new Date(c.last_offline_at as string).getTime();
    const elapsedSec = Math.max(0, elapsedMs / 1000);

    // 2) 표본 부족 / 너무 짧음
    if (elapsedSec < MIN_ELAPSED_SEC) {
      await client.query(
        `UPDATE characters SET last_offline_at = NULL, last_offline_settled_at = NOW() WHERE id = $1`,
        [charId]
      );
      await client.query('COMMIT');
      return { applied: false, reason: 'too_short', elapsedSec };
    }
    if (c.total_kills < MIN_TOTAL_KILLS) {
      await client.query(
        `UPDATE characters SET last_offline_at = NULL, last_offline_settled_at = NOW() WHERE id = $1`,
        [charId]
      );
      await client.query('COMMIT');
      return { applied: false, reason: 'insufficient_kills', elapsedSec };
    }

    const elapsedCapped = Math.min(elapsedSec, OFFLINE_CAP_SEC);

    // 3) 산정
    const expGainRaw  = c.online_exp_rate  * elapsedCapped * MULT;
    const goldGain    = Math.floor(c.online_gold_rate * elapsedCapped * MULT);
    const killsInc    = Math.floor(c.online_kill_rate * elapsedCapped);
    const dropCount   = Math.floor(c.online_drop_rate * elapsedCapped * MULT);

    // 4) 드랍 추첨
    const drops = c.last_field_id_offline
      ? await sampleDropsFromField(c.last_field_id_offline, dropCount)
      : [];

    // 5) 레벨업 처리 (exp 산정 시 분리 — characters 업데이트 전에 적용)
    const expInt = Math.floor(expGainRaw);
    const lvRes = applyExpGain(c.level, c.exp, expInt, c.class_name);

    // 6) characters UPDATE — 레벨업 시 hp 회복까지 처리
    if (lvRes.levelsGained > 0) {
      await client.query(
        `UPDATE characters SET
            level = $1, exp = $2, gold = gold + $3,
            max_hp = max_hp + $4, hp = max_hp + $4,
            node_points = node_points + $5,
            stat_points = COALESCE(stat_points, 0) + $6,
            total_kills = total_kills + $7,
            total_gold_earned = total_gold_earned + $3,
            last_offline_at = NULL,
            last_offline_settled_at = NOW()
          WHERE id = $8`,
        [lvRes.newLevel, lvRes.newExp, goldGain, lvRes.hpGained, lvRes.nodePointsGained,
         lvRes.statPointsGained, killsInc, charId]
      );
    } else {
      await client.query(
        `UPDATE characters SET
            exp = $1, gold = gold + $2,
            total_kills = total_kills + $3,
            total_gold_earned = total_gold_earned + $2,
            last_offline_at = NULL,
            last_offline_settled_at = NOW()
          WHERE id = $4`,
        [lvRes.newExp, goldGain, killsInc, charId]
      );
    }
    await client.query('COMMIT');

    // 7) 드랍 인벤 적재 — 트랜잭션 밖 (인벤토리 함수가 자체 트랜잭션 사용)
    const appliedDrops: { itemId: number; qty: number; itemName?: string }[] = [];
    for (const d of drops) {
      try {
        const item = await getItemDef(d.itemId);
        let preroll: EquipPreroll | undefined;
        // 장비 + 비유니크는 prefix 자동 생성 (시뮬레이션 경로와 동일)
        if (item && item.slot && item.grade !== 'unique') {
          const { generatePrefixes } = await import('../game/prefix.js');
          const { prefixIds, bonusStats, maxTier } = await generatePrefixes(item.required_level || 1);
          const quality = Math.floor(Math.random() * 101);
          preroll = { prefixIds, bonusStats, maxTier, quality };
        }
        const { overflow } = await addItemToInventory(charId, d.itemId, d.qty, undefined, preroll);
        if (overflow < d.qty) {
          appliedDrops.push({ itemId: d.itemId, qty: d.qty - overflow, itemName: item?.name });
        }
      } catch (e) {
        console.error('[offline-settle] drop apply err', charId, d, e);
      }
    }

    return {
      applied: true,
      elapsedSec,
      expGain: expInt,
      goldGain,
      killsInc,
      drops: appliedDrops,
      newLevel: lvRes.newLevel,
      levelsGained: lvRes.levelsGained,
    };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[offline-settle] err', charId, e);
    return { applied: false };
  } finally {
    client.release();
  }
}
