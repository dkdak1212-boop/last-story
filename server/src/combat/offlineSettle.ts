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
  filteredCount?: number;                    // 드랍필터로 자동 폐기된 장비 수
  newLevel?: number;
  levelsGained?: number;
}

interface OfflineBuffSnapshot {
  exp_until: string | null;
  gold_until: string | null;
  drop_until: string | null;
  event_exp_until: string | null;
  event_exp_pct: number;
  event_exp_max_level: number | null;
  event_drop_until: string | null;
  event_drop_pct: number;
  personal_exp_mult: number;
  personal_exp_mult_max_level: number | null;
  // 세션-only 보너스 (오프 진입 시점에서 박제 — 오프 중 변경 무시)
  guild_drop_bonus_pct?: number;
  prefix_drop_bonus_pct?: number;
  territory_drop_bonus_pct?: number;
  ge_drop_mult?: number;             // 글로벌 이벤트 드랍 배수 (1.0 = 비활성)
  ge_drop_ends_at?: string | null;   // 글로벌 이벤트 종료시각 — 시간 비례 적분에 사용
}

interface CharRates {
  id: number;
  user_id: number;
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
  // 오프라인 진입 시점 버프 박제 — 시간 비례 적분에 사용. NULL 이면 legacy fallback.
  offline_buff_snapshot: OfflineBuffSnapshot | null;
  // 부스트 (snapshot 없을 때 fallback — 정산 시점 active 여부만 단순 체크)
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

// [offlineStart, NOW] 와 [offlineStart, until] 의 교집합 길이를 elapsed 로 나눈 비율.
// 즉 오프라인 구간 중 버프가 켜져있던 시간의 비율 (0~1).
// snapshot.until 이 offline 진입 시점의 값이라 grant/연장으로 인한 부당 가산 차단.
function buffOverlapFrac(offlineStartMs: number, nowMs: number, until: string | null): number {
  if (!until) return 0;
  const untilMs = new Date(until).getTime();
  if (untilMs <= offlineStartMs) return 0;
  const elapsed = nowMs - offlineStartMs;
  if (elapsed <= 0) return 0;
  const overlap = Math.min(nowMs, untilMs) - offlineStartMs;
  return Math.max(0, Math.min(1, overlap / elapsed));
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

// 동시 settleOfflineRewards 호출 제한 — pool 부하 차단 (semaphore=5)
let _settleConcurrent = 0;
const _settleQueue: Array<() => void> = [];
const SETTLE_MAX_CONCURRENT = 2;
async function _acquireSettleSlot(): Promise<void> {
  if (_settleConcurrent < SETTLE_MAX_CONCURRENT) {
    _settleConcurrent++;
    return;
  }
  await new Promise<void>(resolve => _settleQueue.push(resolve));
  _settleConcurrent++;
}
function _releaseSettleSlot(): void {
  _settleConcurrent--;
  const next = _settleQueue.shift();
  if (next) next();
}

export async function settleOfflineRewards(charId: number): Promise<OfflineRewardResult> {
  await _acquireSettleSlot();
  let _client: import('pg').PoolClient | null = null;
  try {
  const client = await pool.connect();
  _client = client;
  try {
    await client.query('BEGIN');
    // 1) row lock + 현재 상태 조회 (부스트 컬럼 포함)
    const r = await client.query<CharRates>(
      `SELECT id, user_id, level, exp, class_name, total_kills,
              COALESCE(current_field_kills, 0) AS current_field_kills,
              COALESCE(online_exp_rate, 0)::float8  AS online_exp_rate,
              COALESCE(online_gold_rate, 0)::float8 AS online_gold_rate,
              COALESCE(online_kill_rate, 0)::float8 AS online_kill_rate,
              COALESCE(online_drop_rate, 0)::float8 AS online_drop_rate,
              last_offline_at, last_field_id_offline,
              offline_buff_snapshot,
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
    const offlineStartMs = new Date(c.last_offline_at as string).getTime();
    const nowMsForElapsed = Date.now();
    const elapsedMs = nowMsForElapsed - offlineStartMs;
    let elapsedSec = Math.max(0, elapsedMs / 1000);

    // 어뷰즈 차단: 본캐 오프라인 구간에 같은 user 의 다른 캐릭이 active 사냥 진행
    // 중이었다면 그 시간만큼 elapsed 차감. 부캐도 오프라인 모드(active session 없음)
    // 면 차감 0 → 본캐 정상 누적. 부캐 active session 시작이 본캐 last_offline_at
    // 보다 이후면 (NOW - 부캐 startedAt), 이전이면 (NOW - 본캐 last_offline_at) 차감.
    // 동시간 active 세션이 여러개여도 max 1개분만 차감 (병행 active 시 시간은 같음).
    try {
      const { getOtherActiveSessionStartsForUser } = await import('./engine.js');
      const otherStarts = getOtherActiveSessionStartsForUser(c.user_id, charId);
      let overlapMs = 0;
      for (const startMs of otherStarts) {
        const overlapStart = Math.max(offlineStartMs, startMs);
        const overlap = nowMsForElapsed - overlapStart;
        if (overlap > overlapMs) overlapMs = overlap;
      }
      if (overlapMs > 0) {
        elapsedSec = Math.max(0, elapsedSec - overlapMs / 1000);
        console.log(`[offline-settle] char ${charId}: 다른 active 사냥 ${(overlapMs/1000).toFixed(1)}s 차감`);
      }
    } catch (e) {
      console.error('[offline-settle] overlap calc err', charId, e);
    }

    // 2) 표본 부족 / 너무 짧음
    if (elapsedSec < MIN_ELAPSED_SEC) {
      await client.query(
        `UPDATE characters SET last_offline_at = NULL, last_offline_settled_at = NOW(),
                                offline_buff_snapshot = NULL
           WHERE id = $1`,
        [charId]
      );
      await client.query('COMMIT');
      return { applied: false, reason: 'too_short', elapsedSec };
    }
    if (c.current_field_kills < MIN_CURRENT_FIELD_KILLS) {
      await client.query(
        `UPDATE characters SET last_offline_at = NULL, last_offline_settled_at = NOW(),
                                offline_buff_snapshot = NULL
           WHERE id = $1`,
        [charId]
      );
      await client.query('COMMIT');
      return { applied: false, reason: 'insufficient_kills', elapsedSec };
    }

    const elapsedCapped = Math.min(elapsedSec, OFFLINE_CAP_SEC);

    // 3) 부스트 곱연산 — 시간 비례 적분.
    // snapshot 이 있으면(신규) snapshot.until 기준으로 [offlineStart, NOW] ∩ [offlineStart, until]
    // 비율 산출 → 어뷰즈 차단 (오프 중 grant/연장은 snapshot 에 반영 안 되어 보너스 0).
    // snapshot 이 없으면(legacy: 마이그레이션 이전 오프라인 진입) 현재 컬럼값으로
    // overlap 계산. 이 경우 offline 중 grant 된 버프도 일부 반영될 수 있으나, 다음
    // 오프라인 진입부턴 snapshot 으로 정확해짐.
    const nowMs = nowMsForElapsed;
    const snap = c.offline_buff_snapshot;
    const expUntil   = snap ? snap.exp_until   : c.exp_boost_until;
    const goldUntil  = snap ? snap.gold_until  : c.gold_boost_until;
    const dropUntil  = snap ? snap.drop_until  : c.drop_boost_until;
    const evExpUntil = snap ? snap.event_exp_until : c.event_exp_until;
    const evExpPct   = snap ? snap.event_exp_pct ?? 0 : c.event_exp_pct;
    const evExpMaxLv = snap ? snap.event_exp_max_level : c.event_exp_max_level;
    const evDropUntil = snap ? snap.event_drop_until : c.event_drop_until;
    const evDropPct   = snap ? snap.event_drop_pct ?? 0 : c.event_drop_pct;
    const persExpMult = snap ? (snap.personal_exp_mult ?? 1) : (c.personal_exp_mult || 1);
    const persExpMaxLv = snap ? snap.personal_exp_mult_max_level : c.personal_exp_mult_max_level;

    const expBoostFrac  = buffOverlapFrac(offlineStartMs, nowMs, expUntil);
    const goldBoostFrac = buffOverlapFrac(offlineStartMs, nowMs, goldUntil);
    const dropBoostFrac = buffOverlapFrac(offlineStartMs, nowMs, dropUntil);
    const eventExpFrac  = (evExpMaxLv == null || c.level < evExpMaxLv)
      ? buffOverlapFrac(offlineStartMs, nowMs, evExpUntil) : 0;
    const eventDropFrac = buffOverlapFrac(offlineStartMs, nowMs, evDropUntil);

    const expBoostMul  = 1 + 0.5 * expBoostFrac;   // 1.5× 의 가중치 = 0.5
    const goldBoostMul = 1 + 0.5 * goldBoostFrac;
    const dropBoostMul = 1 + 0.5 * dropBoostFrac;
    const eventExpMul  = 1 + (evExpPct / 100) * eventExpFrac;
    const eventDropMul = 1 + (evDropPct / 100) * eventDropFrac;

    // 세션-only 드랍 보너스 (snapshot 박제분) — 오프 진입 시점 길드/접두사/영지/글로벌이벤트
    // 누락된 경우 0/1 fallback (legacy snapshot OR pre-fix 박제) 으로 안전.
    const guildDropPct     = snap?.guild_drop_bonus_pct ?? 0;
    const prefixDropPct    = snap?.prefix_drop_bonus_pct ?? 0;
    const territoryDropPct = snap?.territory_drop_bonus_pct ?? 0;
    const geDropMult       = snap?.ge_drop_mult ?? 1;
    const geDropEndsAt     = snap?.ge_drop_ends_at ?? null;
    // 글로벌 이벤트는 [offlineStart, NOW] ∩ [offlineStart, ge_drop_ends_at] 비율로 가중.
    // ge_drop_mult=1 (비활성) 면 frac 무관 1 로 수렴.
    const geDropFrac = geDropMult > 1
      ? buffOverlapFrac(offlineStartMs, nowMs, geDropEndsAt) : 0;
    const geDropEffective = 1 + (geDropMult - 1) * geDropFrac;
    // 길드/접두사/영지 보너스는 시간 무관 (오프 중 변경 불가) — 전체 elapsed 에 적용.
    const flatDropBonusPct = guildDropPct + prefixDropPct + territoryDropPct;
    // personal_exp_mult 는 영구 곱연산 (until 없음). max_level 만 체크해 그대로 적용.
    const personalExpActive = persExpMult > 1
      && (persExpMaxLv == null || c.level < persExpMaxLv);
    const personalExpMul = personalExpActive ? persExpMult : 1;

    // 4) 산정
    const expGainRaw  = c.online_exp_rate  * elapsedCapped * MULT * expBoostMul * eventExpMul * personalExpMul;
    const goldGain    = Math.floor(c.online_gold_rate * elapsedCapped * MULT * goldBoostMul);
    const killsInc    = Math.floor(c.online_kill_rate * elapsedCapped);
    // dropMult — 온라인 rollDrops 와 동일 구조:
    //   personal boost × event_drop × (1 + flat 길드/접두사/영지 합) × 글로벌이벤트 배수
    const dropMult    = dropBoostMul * eventDropMul
                      * (1 + flatDropBonusPct / 100)
                      * geDropEffective;

    // 5) 드랍 — killsInc 가상 킬 시뮬 (multi-Bernoulli, 원본 rollDrops 와 동일 분포)
    //    online_drop_rate 는 EMA 통계용으로만 유지, 정산 추첨엔 사용 안 함 (인플레 방지).
    const drops = c.last_field_id_offline
      ? await sampleDropsFromField(c.last_field_id_offline, killsInc, dropMult)
      : [];

    // 5) 레벨업 처리 (exp 산정 시 분리 — characters 업데이트 전에 적용).
    //    이벤트 부스트는 이미 위 expBoostMul/eventExpMul 곱연산에서 max_level 체크로
    //    자연 종료되므로 별도 레벨 cap 불필요. 100레벨 cap 그대로 사용.
    const expInt = Math.floor(expGainRaw);
    const lvRes = applyExpGain(c.level, c.exp, expInt, c.class_name);

    // 6) characters UPDATE — 레벨업 시 hp 회복까지 처리
    // 정산 후 location='village' — 클라이언트 폴링 시 /combat/state 의 auto-restart
    // 로직(field:X + last_offline_at NULL → startCombatSession) 으로 의도치 않게
    // 전투 화면이 자동 진입되는 것 차단. 명시 정산(/combat/resume-from-offline) flow 는
    // settleOfflineRewards 호출 전 char.location 을 캡처하므로 영향 없음.
    if (lvRes.levelsGained > 0) {
      await client.query(
        `UPDATE characters SET
            level = $1, exp = $2, gold = gold + $3,
            max_hp = max_hp + $4, hp = max_hp + $4,
            node_points = node_points + $5,
            stat_points = COALESCE(stat_points, 0) + $6,
            total_kills = total_kills + $7,
            total_gold_earned = total_gold_earned + $3,
            location = 'village',
            last_offline_at = NULL,
            last_offline_settled_at = NOW(),
            offline_buff_snapshot = NULL
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
            location = 'village',
            last_offline_at = NULL,
            last_offline_settled_at = NOW(),
            offline_buff_snapshot = NULL
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

    // drops 처리 순서를 random shuffle — Map.entries() 순서대로 처리하면
    // 첫 itemId 가 인벤 free space 를 다 차지해 다른 itemId 들이 못 들어가는
    // 편향 발생. shuffle 로 매 정산마다 들어가는 itemId 가 random 균등.
    for (let i = drops.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [drops[i], drops[j]] = [drops[j], drops[i]];
    }

    // per-itemId quota — 인벤 free space 가 부족할 경우 한 itemId 가 free 를
    // 다 차지하지 않도록 quota = ceil(free / drops.length) 로 cap. 모든
    // itemId 가 골고루 들어가도록 보장. quota 초과분은 (mailOnOverflow 미설정
    // 정책에 따라) 자연 손실.
    if (drops.length > 0) {
      const usedR = await query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM character_inventory WHERE character_id = $1`, [charId]
      );
      const maxR = await query<{ bonus: number | null }>(
        `SELECT COALESCE(inventory_slots_bonus, 0) AS bonus FROM characters WHERE id = $1`, [charId]
      );
      const used = usedR.rows[0]?.n ?? 0;
      const BASE_SLOTS = 300;
      const maxSlots = BASE_SLOTS + (maxR.rows[0]?.bonus ?? 0);
      const free = Math.max(0, maxSlots - used);
      const totalDropQty = drops.reduce((s, d) => s + d.qty, 0);
      if (totalDropQty > free) {
        const quota = Math.max(1, Math.ceil(free / drops.length));
        for (const d of drops) {
          if (d.qty > quota) d.qty = quota;
        }
        console.log(`[offline-settle] char ${charId}: free=${free} totalQty=${totalDropQty} → per-item quota=${quota}`);
      }
    }

    const appliedDrops: { itemId: number; qty: number; itemName?: string }[] = [];
    let filteredCount = 0;
    // 비유니크 장비는 인스턴스별로 prefix 새로 굴리고 필터 체크 — 온라인 사냥과 동일.
    // 과거 stack 단위 1회 prefix → qty 통째로 필터되는 버그 (T1 필터 시 거의 전손) 수정.
    const { generatePrefixes } = await import('../game/prefix.js');
    for (const d of drops) {
      try {
        const item = await getItemDef(d.itemId);

        // 비장비 / 유니크 / item def 없음 → stack 단위로 add (필터 미적용)
        if (!item || !item.slot || item.grade === 'unique') {
          const { overflow } = await addItemToInventory(charId, d.itemId, d.qty, undefined);
          if (overflow < d.qty) {
            appliedDrops.push({ itemId: d.itemId, qty: d.qty - overflow, itemName: item?.name });
          }
          continue;
        }

        // 비유니크 장비 — 인스턴스별 처리
        let acceptedQty = 0;
        for (let inst = 0; inst < d.qty; inst++) {
          const { prefixIds, bonusStats, maxTier } = await generatePrefixes(item.required_level || 1);
          const quality = Math.floor(Math.random() * 101);
          const preroll: EquipPreroll = { prefixIds, bonusStats, maxTier, quality };

          // 드랍필터 — 인스턴스 단위. 유니크는 위에서 이미 분기됨.
          if (hasDropFilter) {
            if (dfCommon && item.grade === 'common') { filteredCount++; continue; }
            if (dfTiers > 0) {
              const tierBit = maxTier >= 1 && maxTier <= 4 ? (1 << (maxTier - 1)) : 0;
              const dfTierMatch = (dfTiers & tierBit) !== 0;
              const is3Options = prefixIds.length >= 3;
              const protected3opt = is3Options && dfProtect3opt;
              let protectStats: Set<string> | null = null;
              if (prefixIds.length > 0 && dfProtect.size > 0) {
                const keys = await getPrefixStatKeys(prefixIds);
                protectStats = new Set(keys);
              }
              const dfHasProtected = !!(protectStats && [...protectStats].some(st => dfProtect.has(st)));
              if (!protected3opt && !dfHasProtected && dfTierMatch) { filteredCount++; continue; }
            }
          }

          const { overflow } = await addItemToInventory(charId, d.itemId, 1, undefined, preroll);
          if (overflow < 1) acceptedQty++;
        }

        if (acceptedQty > 0) {
          appliedDrops.push({ itemId: d.itemId, qty: acceptedQty, itemName: item.name });
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
      filteredCount,
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
  } finally {
    _releaseSettleSlot();
  }
}
