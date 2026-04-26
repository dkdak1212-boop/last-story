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
import { getItemDef, getPrefixStatKeys } from '../game/contentCache.js';

// EMA 는 100ms tick 실측 기반이라 자체 효율 100%.
// 시뮬 시절의 1.4 보정(자연효율 68% → 95%)을 그대로 적용하면 +40% 오버 인플레이션.
// "딱 사냥속도에 맞게" 원칙 → 1.0 (정확 환산).
const MULT = 1.0;
const OFFLINE_CAP_SEC = 24 * 60 * 60;       // 24시간 상한
const MIN_ELAPSED_SEC = 60;                 // 1분 미만은 스킵 (노이즈)
// 정산 가능 floor — 현재 사냥터에서 잡은 킬 수 (current_field_kills) 기준.
// 사냥터 이동 시 0 리셋 → 새 사냥터에서 20킬 이상 잡아야 정산 가능.
// 누적 total_kills 가 아니라 현재 사냥터 카운트라 더 정확.
const MIN_CURRENT_FIELD_KILLS = 20;
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
  current_field_kills: number;
  online_exp_rate: number;
  online_gold_rate: number;
  online_kill_rate: number;
  online_drop_rate: number;
  last_offline_at: string | null;
  last_field_id_offline: number | null;
  // 부스트 (정산 시점 active 면 곱연산 적용 — EMA 는 base 효율 보존 정책)
  exp_boost_until: string | null;
  gold_boost_until: string | null;
  drop_boost_until: string | null;
  event_exp_until: string | null;
  event_exp_pct: number;
  event_exp_max_level: number | null;
  event_drop_until: string | null;
  event_drop_pct: number;
  personal_exp_mult: number;
  personal_exp_mult_max_level: number | null;
}

// 필드 몬스터·드랍 캐시 (60초 TTL).
// 정산 시 N "가상 킬" 시뮬레이션 — 매 킬마다 원본 rollDrops 와 동일한
// multi-Bernoulli 시행 (각 drop_table 항목별 독립 chance × rateMult).
// multinomial 풀 추첨 방식은 비유니크 0.1 배율 영향으로 유니크 비중이
// 인위적으로 12배 폭증하는 인플레가 발생해 폐기.
interface FieldMonsterCache {
  monsters: { id: number; drop_table: { itemId: number; chance: number; minQty: number; maxQty: number }[] }[];
  loadedAt: number;
}
const fieldMonsterCache = new Map<number, FieldMonsterCache>();
const FIELD_POOL_TTL = 60_000;

let uniqueIdSet: Set<number> | null = null;
async function getUniqueIds(): Promise<Set<number>> {
  if (uniqueIdSet) return uniqueIdSet;
  const r = await query<{ id: number }>("SELECT id FROM items WHERE grade = 'unique'");
  uniqueIdSet = new Set(r.rows.map(x => x.id));
  return uniqueIdSet;
}

async function getFieldMonsters(fieldId: number): Promise<FieldMonsterCache | null> {
  const cached = fieldMonsterCache.get(fieldId);
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
  const cache: FieldMonsterCache = {
    monsters: mr.rows.map(r => ({ id: r.id, drop_table: r.drop_table || [] })),
    loadedAt: Date.now(),
  };
  fieldMonsterCache.set(fieldId, cache);
  return cache;
}

// killsInc 번의 가상 킬을 시뮬레이션하여 드랍 추출.
// 원본 rollDrops 와 동일한 multi-Bernoulli — 비유니크 ×0.1, 유니크 그대로.
// dropMult: 정산 시점 active 인 드랍부스트/이벤트 합산 배율 (chance 에 곱연산).
// 균등 몬스터 추첨(필드 monster_pool 1/N) 가정.
async function sampleDropsFromField(fieldId: number, killsInc: number, dropMult: number = 1): Promise<{ itemId: number; qty: number }[]> {
  if (killsInc <= 0) return [];
  const cache = await getFieldMonsters(fieldId);
  if (!cache || cache.monsters.length === 0) return [];
  const uniques = await getUniqueIds();
  const cap = Math.min(killsInc, MAX_DROP_COUNT);
  const out = new Map<number, number>();
  for (let i = 0; i < cap; i++) {
    const m = cache.monsters[Math.floor(Math.random() * cache.monsters.length)];
    for (const d of m.drop_table) {
      const isUnique = uniques.has(d.itemId);
      const rateMult = isUnique ? 1.0 : DROP_RATE_MULT;
      // chance × rateMult × dropMult 가 1 초과 시 1 로 cap (확률 의미 보존)
      const prob = Math.min(1, d.chance * rateMult * dropMult);
      if (Math.random() < prob) {
        const qty = d.minQty + Math.floor(Math.random() * (d.maxQty - d.minQty + 1));
        if (qty > 0) out.set(d.itemId, (out.get(d.itemId) ?? 0) + qty);
      }
    }
  }
  return [...out.entries()].map(([itemId, qty]) => ({ itemId, qty }));
}

export async function settleOfflineRewards(charId: number): Promise<OfflineRewardResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 1) row lock + 현재 상태 조회 (부스트 컬럼 포함)
    const r = await client.query<CharRates>(
      `SELECT id, level, exp, class_name, total_kills,
              COALESCE(current_field_kills, 0) AS current_field_kills,
              COALESCE(online_exp_rate, 0)::float8  AS online_exp_rate,
              COALESCE(online_gold_rate, 0)::float8 AS online_gold_rate,
              COALESCE(online_kill_rate, 0)::float8 AS online_kill_rate,
              COALESCE(online_drop_rate, 0)::float8 AS online_drop_rate,
              last_offline_at, last_field_id_offline,
              exp_boost_until, gold_boost_until, drop_boost_until,
              event_exp_until, COALESCE(event_exp_pct, 0)::int AS event_exp_pct, event_exp_max_level,
              event_drop_until, COALESCE(event_drop_pct, 0)::int AS event_drop_pct,
              COALESCE(personal_exp_mult, 1)::float8 AS personal_exp_mult, personal_exp_mult_max_level
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
    if (c.current_field_kills < MIN_CURRENT_FIELD_KILLS) {
      await client.query(
        `UPDATE characters SET last_offline_at = NULL, last_offline_settled_at = NOW() WHERE id = $1`,
        [charId]
      );
      await client.query('COMMIT');
      return { applied: false, reason: 'insufficient_kills', elapsedSec };
    }

    const elapsedCapped = Math.min(elapsedSec, OFFLINE_CAP_SEC);

    // 3) 정산 시점 부스트 곱연산 (EMA 가 base 효율이라 부스트 active 시 별도 적용)
    const nowMs = Date.now();
    const isActiveAt = (s: string | null) => !!(s && new Date(s).getTime() > nowMs);
    const expBoostMul   = isActiveAt(c.exp_boost_until)  ? 1.5 : 1;
    const goldBoostMul  = isActiveAt(c.gold_boost_until) ? 1.5 : 1;
    const dropBoostMul  = isActiveAt(c.drop_boost_until) ? 1.5 : 1;
    const eventExpActive = isActiveAt(c.event_exp_until)
      && (c.event_exp_max_level == null || c.level < c.event_exp_max_level);
    const eventExpMul    = eventExpActive ? 1 + c.event_exp_pct / 100 : 1;
    const eventDropMul   = isActiveAt(c.event_drop_until) ? 1 + c.event_drop_pct / 100 : 1;
    const personalExpActive = (c.personal_exp_mult || 1) > 1
      && (c.personal_exp_mult_max_level == null || c.level < c.personal_exp_mult_max_level);
    const personalExpMul = personalExpActive ? c.personal_exp_mult : 1;

    // 4) 산정
    const expGainRaw  = c.online_exp_rate  * elapsedCapped * MULT * expBoostMul * eventExpMul * personalExpMul;
    const goldGain    = Math.floor(c.online_gold_rate * elapsedCapped * MULT * goldBoostMul);
    const killsInc    = Math.floor(c.online_kill_rate * elapsedCapped);
    const dropMult    = dropBoostMul * eventDropMul;

    // 5) 드랍 — killsInc 가상 킬 시뮬 (multi-Bernoulli, 원본 rollDrops 와 동일 분포)
    //    online_drop_rate 는 EMA 통계용으로만 유지, 정산 추첨엔 사용 안 함 (인플레 방지).
    const drops = c.last_field_id_offline
      ? await sampleDropsFromField(c.last_field_id_offline, killsInc, dropMult)
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

    // 6.5) 레벨업 시 차원새싹상자 마일스톤 체크 (Lv.10/30/50/70/90/100).
    //      온라인 사냥(engine.ts handleMonsterDeath) 과 동일 처리.
    //      트랜잭션 밖에서 fire-and-forget — 우편 발송이라 멱등 가드(sprout_boxes_sent) 있음.
    if (lvRes.levelsGained > 0) {
      (async () => {
        try {
          const { checkSproutMilestones } = await import('../routes/sproutBox.js');
          await checkSproutMilestones(charId, c.level, lvRes.newLevel);
        } catch (e) { console.error('[offline-settle] sprout milestone fail', charId, e); }
      })();
    }

    // 7) 드랍 인벤 적재 — 트랜잭션 밖 (인벤토리 함수가 자체 트랜잭션 사용)
    //    온라인 시뮬과 동일한 드랍필터(common/티어/3옵 보호/접두사 보호) 적용.
    const filterRow = await query<{
      drop_filter_tiers: number;
      drop_filter_common: boolean;
      drop_filter_protect_prefixes: string[];
      drop_filter_protect_3opt: boolean;
    }>(
      `SELECT COALESCE(drop_filter_tiers, 0)              AS drop_filter_tiers,
              COALESCE(drop_filter_common, FALSE)         AS drop_filter_common,
              COALESCE(drop_filter_protect_prefixes, '{}') AS drop_filter_protect_prefixes,
              COALESCE(drop_filter_protect_3opt, TRUE)    AS drop_filter_protect_3opt
         FROM characters WHERE id = $1`,
      [charId]
    );
    const f = filterRow.rows[0];
    const dfTiers   = f?.drop_filter_tiers ?? 0;
    const dfCommon  = !!f?.drop_filter_common;
    const dfProtect = new Set(f?.drop_filter_protect_prefixes ?? []);
    const dfProtect3opt = f?.drop_filter_protect_3opt ?? true;
    const hasDropFilter = dfTiers > 0 || dfCommon;

    const appliedDrops: { itemId: number; qty: number; itemName?: string }[] = [];
    let filteredCount = 0;
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

          // 드랍필터 — 시뮬과 동일 로직. 유니크는 항상 통과.
          if (hasDropFilter) {
            // 일반등급 자동 버림
            if (dfCommon && item.grade === 'common') { filteredCount++; continue; }
            // 티어 필터 — 비트마스크 (1=T1, 2=T2, 4=T3, 8=T4)
            if (dfTiers > 0) {
              const tierBit = maxTier >= 1 && maxTier <= 4 ? (1 << (maxTier - 1)) : 0;
              const dfTierMatch = (dfTiers & tierBit) !== 0;
              const is3Options = prefixIds.length >= 3;
              const protected3opt = is3Options && dfProtect3opt;
              // 보호 접두사 검사
              let protectStats: Set<string> | null = null;
              if (prefixIds.length > 0 && dfProtect.size > 0) {
                const keys = await getPrefixStatKeys(prefixIds);
                protectStats = new Set(keys);
              }
              const dfHasProtected = !!(protectStats && [...protectStats].some(st => dfProtect.has(st)));
              if (!protected3opt && !dfHasProtected && dfTierMatch) { filteredCount++; continue; }
            }
          }
        }
        const { overflow } = await addItemToInventory(charId, d.itemId, d.qty, undefined, preroll);
        if (overflow < d.qty) {
          appliedDrops.push({ itemId: d.itemId, qty: d.qty - overflow, itemName: item?.name });
        }
      } catch (e) {
        console.error('[offline-settle] drop apply err', charId, d, e);
      }
    }
    if (filteredCount > 0) {
      console.log(`[offline-settle] char ${charId}: 드랍필터로 ${filteredCount}개 자동 버림`);
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
