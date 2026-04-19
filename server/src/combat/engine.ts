// v0.9 게이지 기반 전투 엔진
import { query } from '../db/pool.js';
import { calcDamage, type EffectiveStats } from '../game/formulas.js';
import { applyExpGain } from '../game/leveling.js';
import { getGuildSkillsForCharacter, contributeGuildExp, GUILD_SKILL_PCT } from '../game/guild.js';
import { addTerritoryScore, getTerritoryBonusForChar } from '../game/territory.js';
import { loadCharacter, getEffectiveStats, getNodePassives } from '../game/character.js';
import { addItemToInventory, deliverToMailbox, type EquipPreroll } from '../game/inventory.js';
import { expToNext } from '../game/leveling.js';
import { trackMonsterKill } from '../routes/quests.js';
import { trackDailyQuestProgress } from '../routes/dailyQuests.js';
import { checkAndUnlockAchievements } from '../game/achievements.js';
import type { Stats } from '../game/classes.js';
import { getActiveGlobalEvent } from '../game/globalEvent.js';
import { getItemDef, getPrefixStatKeys } from '../game/contentCache.js';
import { applyDamageToRun, markRunEndedByEngine, getBossById, ELEMENTS as GB_ELEMENTS, type GuildBossData } from './guildBossHelpers.js';
// StatusEffect는 combat/shared.ts로 이동됨 — 레이드 보스(worldEvent.ts)와 공유
import type { StatusEffect } from './shared.js';
import { calcDotTickDamage } from './shared.js';

interface CombatSkillInfoLocal {
  id: number;
  name: string;
  cooldownMax: number;
  cooldownLeft: number;
  usable: boolean;
}

interface CombatSnapshot {
  inCombat: boolean;
  fieldName?: string;
  autoMode: boolean;
  waitingInput: boolean;
  player: {
    hp: number; maxHp: number; gauge: number; speed: number;
    effects: StatusEffect[];
  };
  monster?: {
    name: string; hp: number; maxHp: number; level: number;
    gauge: number; speed: number; effects: StatusEffect[];
  };
  skills: CombatSkillInfoLocal[];
  log: string[];
  potions?: { small: number; mid: number; high: number; max: number };
  autoPotion: { enabled: boolean; threshold: number };
  exp?: number;
  expMax?: number;
  serverTime: number;
  boosts?: { name: string; until: string }[];
  guildBuffs?: { hp: number; gold: number; exp: number; drop: number };
  territoryBuffs?: { expPct: number; dropPct: number };
  rage?: number; // 전사 전용 분노 게이지
  manaFlow?: { stacks: number; active: number }; // 마법사 전용: 마나의 흐름
  poisonResonance?: number; // 도적 전용: 독의 공명 (0~10)
  dummy?: { totalDamage: number; elapsedMs: number }; // 허수아비 존: 누적 데미지 + 경과 시간
  killStats?: { last: number; avg: number; count: number; current: number }; // 처치 시간 통계
  summons?: { skillName: string; element?: string; remainingActions: number }[]; // 소환사 전용: 활성 소환수 목록
  afk?: {
    mode: boolean;
    elapsedMs: number;
    exp: number;
    gold: number;
    kills: number;
    damage: number;
    dps: number;
    quality100: number;
    unique: number;
    t4Prefix: number;
    playerHp: number;
    playerMaxHp: number;
    dead: boolean;
  };
  guildBossRunId?: string; // 길드 보스 세션이면 runId 노출 (클라에서 ∞ HP / 퇴장 버튼 전환)
}
import { getIo } from '../ws/io.js';

const GAUGE_MAX = 1000;
const MAX_LOG = 30;
// 100ms 틱에서 speed를 이 비율로 충전 (0.2 = speed 300일 때 ~1.7초 행동주기)
const GAUGE_FILL_RATE = 0.2;

// 속도 감쇠 — 소프트캡 300, 이후 평방근 감쇠
// 고레벨 몬스터 CC 저항 — Lv.90+ 몬스터는 70% 확률로 CC 무시
function monsterResistsCC(monsterLevel: number): boolean {
  if (monsterLevel < 90) return false;
  return Math.random() < 0.70;
}

// 300 이하: 그대로, 300 이상: 300 + sqrt(초과분) * 15
// 예) spd 300→300, 500→326, 800→367, 1200→413
function diminishSpeed(rawSpd: number): number {
  const SOFT_CAP = 300;
  if (rawSpd <= SOFT_CAP) return rawSpd;
  return Math.round(SOFT_CAP + Math.sqrt(rawSpd - SOFT_CAP) * 15);
}

// 레벨차에 따른 EXP 배율 — 캐릭터가 몬스터보다 높을수록 감소.
// 0~9 차이: 100%, 10: 70%, 12: 50%, 15: 30%, 18: 15%, 20+: 10% (최저)
// 캐릭터가 더 낮으면 100% (몬스터가 더 강하므로 페널티 없음)
export function computeLevelDiffExpMult(charLevel: number, monsterLevel: number): number {
  const diff = charLevel - monsterLevel;
  if (diff < 10) return 1.0;
  if (diff < 12) return 0.70;
  if (diff < 15) return 0.50;
  if (diff < 18) return 0.30;
  if (diff < 20) return 0.15;
  return 0.10;
}

// ── 타입 ──

// SessionRow removed — in-memory only now

interface MonsterDef {
  id: number;
  name: string;
  level: number;
  max_hp: number;
  exp_reward: number;
  gold_reward: number;
  stats: Stats;
  drop_table: { itemId: number; chance: number; minQty: number; maxQty: number }[];
}

export interface SkillDef {
  id: number;
  name: string;
  damage_mult: number;
  kind: string;
  cooldown_actions: number;
  flat_damage: number;
  effect_type: string;
  effect_value: number;
  effect_duration: number;
  required_level: number;
  slot_order: number;
  element?: string | null;
  description?: string;
}

// ── 활성 세션 관리 (인메모리) ──

interface ActiveSession {
  characterId: number;
  className: string;
  fieldId: number;
  monsterId: number | null;
  monsterName: string;
  monsterLevel: number;
  monsterHp: number;
  monsterMaxHp: number;
  monsterSpeed: number;
  monsterGauge: number;
  monsterStats: EffectiveStats;
  playerHp: number;
  playerMaxHp: number;
  playerGauge: number;
  playerSpeed: number;
  playerStats: EffectiveStats;
  autoMode: boolean;
  waitingInput: boolean;
  waitingSince: number;
  autoPotionEnabled: boolean;
  autoPotionThreshold: number; // HP% 이하일 때 물약 사용
  potionCooldown: number; // 물약 쿨타임 (남은 행동 수)
  skillCooldowns: Map<number, number>;  // skillId → remaining actions
  skillLastUsed: Map<number, number>;  // skillId → actionCount when last used (LRU)
  statusEffects: StatusEffect[];
  actionCount: number;
  log: string[];
  skills: SkillDef[];
  passives: Map<string, number>;
  equipPrefixes: Record<string, number>;
  fieldName: string;
  dirty: boolean;
  ticksSinceLastHit: number; // 각성 접두사용 (5초 = 50틱)
  hasFirstStrike: boolean; // 약점간파 (몬스터당 첫 공격)
  missStack: number; // 신중한 (miss_combo_pct) — 빗나감 누적 (cap 5)
  dodgeBurstPending: boolean; // 회피의 (evasion_burst_pct) — 회피 직후 다음 공격 보너스
  rage: number; // 전사 전용: 분노 게이지 (0~100, 100 시 다음 공격 ×3)
  manaFlowStacks: number; // 마법사 전용: 마나의 흐름 스택 (0~5)
  manaFlowActive: number; // 마법사 전용: 마나의 흐름 버스트 남은 행동 (0=비활성)
  dummyDamageTotal: number; // 허수아비 존: 누적 데미지
  dummyTrackStart: number; // 허수아비 존: 측정 시작 ms (0=미시작)
  mageOverkillCarry: number; // 마법사 전용: 오버킬 캐리 (다음 스폰 HP에서 차감)
  poisonResonance: number; // 도적 전용: 독의 공명 게이지 (0~10)
  rogueDotCarry?: { value: number; remainingActions: number; dotMult: number; dotUseMatk: boolean }[]; // 도적 전용: 처치 시 캡처해 다음 몬스터로 전이할 독 스택 (cap 20)
  guildBossRunId: string | null; // 길드 보스 세션 플래그 (null이면 일반 사냥)
  guildBossBoss: GuildBossData | null; // 길드 보스 메타데이터 (스폰 시 재사용)
  guildBossDmgBuffer: number; // flush 전 누적 raw 데미지
  guildBossHitsBuffer: number; // flush 전 누적 타격 수
  guildBossStartedAt: number; // 광분 타이머 기준 (unix ms, 0이면 미사용)
  comboKills: number; // 도적 전용: 연속킬 카운터 (combo_kill_bonus)
  hasFirstSkill: boolean; // 도적 전용: shadow_strike (전투 시작 후 첫 스킬)
  monsterSpawnAt: number; // 현재 몬스터 스폰 시각 ms (처치 시간 측정용)
  recentKillTimes: number[]; // 최근 10킬의 처치 시간 (초)
  userId: number;
  lastPushAt: number; // egress 절감용 throttle 타임스탬프
  enteredFieldAt: number; // 사냥터 진입 시각 — 진입 후 60초간만 풀 fps push, 이후 저대역 모드
  // ── 메타 캐시 (DB 재조회 최소화) ──
  metaDirty: boolean;
  cachedExp: number;
  cachedExpMax: number;
  cachedBoosts: { name: string; until: string }[];
  cachedPotions: { small: number; mid: number; high: number; max: number };
  cachedGuildBuffs: { hp: number; gold: number; exp: number; drop: number };
  monsterDef: MonsterDef | null; // 현재 스폰된 몬스터 정의 캐시 (handleMonsterDeath 에서 재사용)
  autoSellCache: {
    auto_dismantle_tiers: number;
    auto_sell_quality_max: number;
    auto_sell_protect_prefixes: string[];
    drop_filter_tiers: number;
    drop_filter_quality_max: number;
    drop_filter_common: boolean;
    drop_filter_protect_prefixes: string[];
  } | null; // 자동판매/드랍필터 설정 세션 캐시 (설정 변경 시 invalidateAutoSellCache 호출)
  // ── AFK(방치) 모드 카운터 ──
  afkMode: boolean;
  afkStartedAt: number;     // ms
  afkExpGained: number;
  afkGoldGained: number;
  afkKills: number;
  afkDamage: number;        // 누적 플레이어 데미지
  afkQuality100: number;    // 100% 품질 드랍 수
  afkUnique: number;        // 유니크 드랍 수
  afkT4Prefix: number;      // T4 접두사 드랍 수
}

export const activeSessions = new Map<number, ActiveSession>();
let combatInterval: ReturnType<typeof setInterval> | null = null;
let tickRunning = false;

// ── DB 쓰기 배치 누적기 ──
// 전투 중 발생하는 hot-path UPDATE(exp/gold/kills/goldEarned)를 메모리에 누적하고
// 1초마다 한 번에 flush. 레벨업/드롭/사망 등은 기존처럼 즉시 쓰기 유지.
interface CharWriteBatch {
  expDelta: number;
  goldDelta: number;
  killDelta: number;
  goldEarnedDelta: number;
}
const charBatch = new Map<number, CharWriteBatch>();
function batchAdd(charId: number, patch: Partial<CharWriteBatch>) {
  let b = charBatch.get(charId);
  if (!b) { b = { expDelta: 0, goldDelta: 0, killDelta: 0, goldEarnedDelta: 0 }; charBatch.set(charId, b); }
  b.expDelta += patch.expDelta || 0;
  b.goldDelta += patch.goldDelta || 0;
  b.killDelta += patch.killDelta || 0;
  b.goldEarnedDelta += patch.goldEarnedDelta || 0;
}
async function flushCharBatch(onlyId?: number): Promise<void> {
  const targets = onlyId !== undefined ? [onlyId] : [...charBatch.keys()];
  // 단일 bulk UPDATE — N개 개별 쿼리 대신 unnest 배열 한 번 실행
  // EMA 갱신: new_rate = old_rate * 0.99 + delta * 0.01 (~100초 이동평균)
  const ids: number[] = [];
  const expDs: number[] = [];
  const goldDs: number[] = [];
  const killDs: number[] = [];
  const earnedDs: number[] = [];
  for (const id of targets) {
    const b = charBatch.get(id);
    if (!b) continue;
    charBatch.delete(id);
    if (!b.expDelta && !b.goldDelta && !b.killDelta && !b.goldEarnedDelta) continue;
    ids.push(id);
    expDs.push(b.expDelta);
    goldDs.push(b.goldDelta);
    killDs.push(b.killDelta);
    earnedDs.push(b.goldEarnedDelta);
  }
  if (ids.length === 0) return;
  try {
    await query(
      `UPDATE characters c SET
         exp = c.exp + v.exp_d,
         gold = c.gold + v.gold_d,
         total_kills = c.total_kills + v.kill_d,
         total_gold_earned = c.total_gold_earned + v.earned_d,
         online_exp_rate  = c.online_exp_rate  * 0.99 + v.exp_d::numeric    * 0.01,
         online_gold_rate = c.online_gold_rate * 0.99 + v.earned_d::numeric * 0.01,
         online_kill_rate = c.online_kill_rate * 0.99 + v.kill_d::numeric   * 0.01
       FROM (
         SELECT
           unnest($1::int[])    AS id,
           unnest($2::bigint[]) AS exp_d,
           unnest($3::bigint[]) AS gold_d,
           unnest($4::int[])    AS kill_d,
           unnest($5::bigint[]) AS earned_d
       ) v
       WHERE c.id = v.id`,
      [ids, expDs, goldDs, killDs, earnedDs]
    );
  } catch (e) {
    console.error('[combat] bulk flush err', e);
  }
}
setInterval(() => { flushCharBatch().catch(err => console.error('[combat] batch interval err', err)); }, 1000);

// 소환수/쿨다운 상태를 DB에 주기적 저장 (30초)
let lastSummonSave = 0;
setInterval(async () => {
  if (Date.now() - lastSummonSave < 30000) return;
  lastSummonSave = Date.now();
  for (const [charId, s] of activeSessions) {
    if (s.className !== 'summoner') continue;
    const summons = s.statusEffects.filter(e => e.type === 'summon' && e.source === 'player' && e.remainingActions > 0);
    if (summons.length === 0) continue;
    try {
      const cdObj: Record<string, number> = {};
      for (const [k, v] of s.skillCooldowns) cdObj[String(k)] = v;
      await query(
        'UPDATE combat_sessions SET status_effects = $1::jsonb, skill_cooldowns = $2::jsonb WHERE character_id = $3',
        [JSON.stringify(summons), JSON.stringify(cdObj), charId]
      );
    } catch {}
  }
}, 10000);

// ── 헬퍼 ──

function monsterToEffective(m: MonsterDef): EffectiveStats {
  const s = m.stats;
  // 레벨 50 이상 몬스터는 공격력/방어력 3배 (난이도 상향)
  const highTierMult = m.level >= 50 ? 3.0 : 1.0;
  return {
    str: s.str, dex: s.dex, int: s.int, vit: s.vit, spd: s.spd, cri: s.cri,
    maxHp: m.max_hp,
    atk: s.str * 1.0 * highTierMult,
    matk: s.int * 1.2 * highTierMult,
    def: s.vit * 0.8 * highTierMult,
    mdef: s.int * 0.5 * highTierMult,
    dodge: s.dex * 0.4,
    accuracy: 80 + s.dex * 0.5,
  };
}

async function pickRandomMonster(fieldId: number): Promise<MonsterDef | null> {
  const fr = await query<{ monster_pool: number[] }>('SELECT monster_pool FROM fields WHERE id = $1', [fieldId]);
  if (fr.rowCount === 0) return null;
  const pool = fr.rows[0].monster_pool;
  if (pool.length === 0) return null;
  const mid = pool[Math.floor(Math.random() * pool.length)];
  const mr = await query<MonsterDef>(
    `SELECT id, name, level, max_hp, exp_reward, gold_reward, stats, drop_table
     FROM monsters WHERE id = $1`, [mid]
  );
  return mr.rows[0] || null;
}

// 장비 접두사 특수 효과 합산 로드
export async function loadEquipPrefixes(characterId: number): Promise<Record<string, number>> {
  const r = await query<{ enhance_level: number; prefix_stats: Record<string, number> | null }>(
    `SELECT ce.enhance_level, ce.prefix_stats FROM character_equipped ce WHERE ce.character_id = $1`,
    [characterId]
  );
  const totals: Record<string, number> = {};
  for (const row of r.rows) {
    if (!row.prefix_stats) continue;
    const el = row.enhance_level || 0;
    const mult = 1 + el * 0.05; // 강화당 접두사 +5%
    for (const [k, v] of Object.entries(row.prefix_stats)) {
      totals[k] = (totals[k] || 0) + Math.round((v as number) * mult);
    }
  }
  return totals;
}

const MAX_COMBAT_SKILLS = 7;

export async function getCharSkills(characterId: number, className: string, level: number): Promise<SkillDef[]> {
  // 컬럼 보장 (방어적 — 마이그레이션이 아직 안 돈 상황 대비)
  try {
    await query(`ALTER TABLE character_skills ADD COLUMN IF NOT EXISTS slot_order INT NOT NULL DEFAULT 0`);
  } catch {}

  // 자동 학습 (신규 스킬)
  try {
    const newSkills = await query<{ id: number; cooldown_actions: number; kind: string }>(
      `SELECT s.id, s.cooldown_actions, s.kind FROM skills s
       WHERE s.class_name = $1 AND s.required_level <= $2
         AND NOT EXISTS (SELECT 1 FROM character_skills cs WHERE cs.character_id = $3 AND cs.skill_id = s.id)`,
      [className, level, characterId]
    );
    for (const sk of newSkills.rows) {
      // 자유행동(buff)·기본기(cd=0)는 슬롯 카운트에 포함되지 않으며 항상 ON
      // 그 외 일반 스킬은 OFF 상태로 학습 → 유저가 직접 ON 토글 필요
      const isFreeAction = sk.kind === 'buff' || sk.cooldown_actions === 0;
      const autoOn = isFreeAction;
      const maxR = await query<{ mx: number | null }>(
        `SELECT COALESCE(MAX(slot_order), 0) AS mx FROM character_skills WHERE character_id = $1`, [characterId]
      );
      const nextOrder = (maxR.rows[0]?.mx ?? 0) + 1;
      await query(
        'INSERT INTO character_skills (character_id, skill_id, auto_use, slot_order) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [characterId, sk.id, autoOn, nextOrder]
      );
    }
  } catch (e) {
    console.error('[getCharSkills] auto-learn failed:', e);
  }

  // 안전망: cd=0 기본기는 무조건 auto_use=TRUE로 강제 (기본 공격은 항상 발동)
  // 자유행동(kind='buff')은 강제 ON 안 함 — 유저가 직접 on/off 토글 가능해야 함
  // 예외: 소환사 늑대 소환 — 유저가 on/off 토글할 수 있도록 강제하지 않음
  try {
    await query(`
      UPDATE character_skills cs SET auto_use = TRUE
      FROM skills s
      WHERE s.id = cs.skill_id AND cs.character_id = $1
        AND s.cooldown_actions = 0 AND cs.auto_use = FALSE
        AND NOT (s.class_name = 'summoner' AND s.name = '늑대 소환')
    `, [characterId]);
  } catch {}

  // ON된 스킬을 slot_order 순으로 (cd=0 기본기 포함)
  try {
    const r = await query<SkillDef>(
      `SELECT s.id, s.name, s.damage_mult, s.kind, s.cooldown_actions, s.flat_damage,
              s.effect_type, s.effect_value, s.effect_duration, s.required_level, s.element, s.description,
              COALESCE(cs.slot_order, 9999) AS slot_order
       FROM skills s
       JOIN character_skills cs ON cs.skill_id = s.id AND cs.character_id = $3
       WHERE s.class_name = $1 AND s.required_level <= $2 AND cs.auto_use = TRUE
       ORDER BY cs.slot_order ASC, s.required_level ASC`,
      [className, level, characterId]
    );
    return r.rows;
  } catch (e) {
    console.error('[getCharSkills] primary query failed, falling back:', e);
    // 폴백: slot_order 없이 학습한 모든 스킬 로드
    const r = await query<Omit<SkillDef, 'slot_order'>>(
      `SELECT s.id, s.name, s.damage_mult, s.kind, s.cooldown_actions, s.flat_damage,
              s.effect_type, s.effect_value, s.effect_duration, s.required_level, s.element, s.description
       FROM skills s
       WHERE s.class_name = $1 AND s.required_level <= $2
       ORDER BY s.required_level ASC`,
      [className, level]
    );
    return r.rows.map((row, i) => ({ ...row, slot_order: i + 1 }));
  }
}

// 드롭률 배율: 기본 x0.1 (드롭 부스터로 1.5배)
// 유니크 아이템은 배율 적용 없이 DB 확률 그대로 사용
const DROP_RATE_MULT = 0.1;

// 유니크 아이템 ID 캐시 (startup 시 로드 — 신규 유니크 추가 시 재시작 필요)
const uniqueItemIds = new Set<number>();
export async function loadUniqueItemIds() {
  const r = await query<{ id: number }>("SELECT id FROM items WHERE grade = 'unique'");
  uniqueItemIds.clear();
  for (const row of r.rows) uniqueItemIds.add(row.id);
  console.log(`[drop] 유니크 ${uniqueItemIds.size}개 캐시`);
}

function rollDrops(m: MonsterDef, dropBoost: boolean = false, guildDropPct: number = 0, globalDropMult: number = 1): { itemId: number; qty: number }[] {
  const drops: { itemId: number; qty: number }[] = [];
  const boostMult = dropBoost ? 1.5 : 1.0;
  const guildMult = 1 + guildDropPct / 100;
  for (const d of m.drop_table || []) {
    // 유니크는 DROP_RATE_MULT 제외 (DB 확률 그대로)
    const rateMult = uniqueItemIds.has(d.itemId) ? 1.0 : DROP_RATE_MULT;
    if (Math.random() < d.chance * rateMult * boostMult * guildMult * globalDropMult) {
      const qty = d.minQty + Math.floor(Math.random() * (d.maxQty - d.minQty + 1));
      if (qty > 0) drops.push({ itemId: d.itemId, qty });
    }
  }
  return drops;
}

// countPotions removed — potions handled inline

async function getPotionInInventory(characterId: number, itemIds: number[]) {
  const r = await query<{ id: number; item_id: number; quantity: number }>(
    `SELECT id, item_id, quantity FROM character_inventory
     WHERE character_id = $1 AND item_id = ANY($2::int[]) AND quantity > 0
     ORDER BY slot_index ASC LIMIT 1`,
    [characterId, itemIds]
  );
  return r.rows[0] || null;
}

async function consumeOneFromSlot(slotId: number) {
  await query('UPDATE character_inventory SET quantity = quantity - 1 WHERE id = $1', [slotId]);
  await query('DELETE FROM character_inventory WHERE id = $1 AND quantity <= 0', [slotId]);
}

function addLog(s: ActiveSession, msg: string) {
  s.log.push(msg);
  if (s.log.length > MAX_LOG) s.log.shift();
  s.dirty = true;
}

// 길드 보스에 면역인 CC 계열 이펙트 (플레이어가 몬스터에게 거는 디버프)
const CC_EFFECT_TYPES = new Set(['stun', 'gauge_freeze', 'gauge_reset', 'accuracy_debuff', 'damage_taken_up']);

// 길드 보스 무적 상한 — 30행동(대략 1분) 이상 지속되지 않게 강제
const GUILD_BOSS_INVINCIBLE_MAX_ACTIONS = 30;

function addEffect(s: ActiveSession, effect: Omit<StatusEffect, 'id'>) {
  // 길드 보스: 플레이어가 건 CC/디버프 면역 (speed_mod 음수 포함)
  if (s.guildBossRunId && effect.source === 'player') {
    const isSlow = effect.type === 'speed_mod' && effect.value < 0;
    if (CC_EFFECT_TYPES.has(effect.type) || isSlow) {
      return; // 적용 없이 조용히 무시
    }
  }
  // 길드 보스: 플레이어 자가 무적 버프 지속시간 상한 (1분 환산 ~30행동)
  if (s.guildBossRunId && effect.type === 'invincible' && effect.source === 'monster') {
    if (effect.remainingActions > GUILD_BOSS_INVINCIBLE_MAX_ACTIONS) {
      effect.remainingActions = GUILD_BOSS_INVINCIBLE_MAX_ACTIONS;
    }
  }
  // speed_mod 머지 정책
  //  - source='player' (몬스터에게 건 디버프): 같은 부호끼리 갱신 (AOE 중첩 방지)
  //  - source='monster' (플레이어 자가 버프/자해 페널티): 머지하지 않고 모두 stack
  //    → 마력집중(+)과 마력과부하(−) 공존, 서로 다른 자가 버프 복수 공존 허용
  if (effect.type === 'speed_mod' && effect.source === 'player') {
    const sameSign = (a: number, b: number) => (a >= 0) === (b >= 0);
    const existing = s.statusEffects.find(e =>
      e.type === 'speed_mod' && e.source === 'player' &&
      sameSign(e.value, effect.value) && e.remainingActions > 0
    );
    if (existing) {
      if (Math.abs(effect.value) >= Math.abs(existing.value)) {
        existing.value = effect.value;
        existing.remainingActions = Math.max(existing.remainingActions, effect.remainingActions);
      }
      return;
    }
  }
  // dot/poison: 중첩 허용 (그대로 push)
  s.statusEffects.push({ ...effect, id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}` });
  // 도적 독의 공명: 독 스택이 적에게 쌓일 때마다 +1 게이지 (최대 10)
  if (s.className === 'rogue' && effect.type === 'poison' && effect.source === 'player') {
    s.poisonResonance = Math.min(10, s.poisonResonance + 1);
  }
}

function hasEffect(s: ActiveSession, target: 'player' | 'monster', type: string): boolean {
  return s.statusEffects.some(e => e.source === target && e.type === type && e.remainingActions > 0);
}

// 데미지 스킬 공통 접두사 파이프라인 — atk_buff/damage_taken_up/광전사/약점간파/각성/치명 데미지를 일괄 적용
// consumeOneShot=false 면 first_strike / ambush 소비를 건너뜀 (multi_hit 후속 타격용)
function applyDamagePrefixes(
  s: ActiveSession,
  dmg: number,
  isCrit: boolean,
  opts: { consumeOneShot?: boolean; skillName?: string } = {},
): number {
  const consume = opts.consumeOneShot !== false;
  // 디버프: damage_taken_up (적이 받는 데미지 증가 — 방패 강타 등)
  const dtUp = s.statusEffects.find(e => e.type === 'damage_taken_up' && e.source === 'player' && e.remainingActions > 0);
  if (dtUp) dmg = Math.round(dmg * (1 + dtUp.value / 100));
  // 버프: atk_buff (자가 공격력 버프 — 전쟁의 함성 등)
  const atkBuff = s.statusEffects.find(e => e.type === 'atk_buff' && e.source === 'monster' && e.remainingActions > 0);
  if (atkBuff) dmg = Math.round(dmg * (1 + atkBuff.value / 100));
  // 광전사 (내 HP 30% 이하)
  const berserk = s.equipPrefixes.berserk_pct || 0;
  if (berserk > 0 && s.playerHp / s.playerMaxHp <= 0.3) {
    dmg = Math.round(dmg * (1 + berserk / 100));
  }
  // 약점간파 (첫 공격, 1회성)
  if (consume) {
    const firstStrike = s.equipPrefixes.first_strike_pct || 0;
    if (firstStrike > 0 && s.hasFirstStrike) {
      dmg = Math.round(dmg * (1 + firstStrike / 100));
      s.hasFirstStrike = false;
      addLog(s, `[약점간파] 첫 공격 +${firstStrike}%`);
    }
    // 각성 (5초 이상 미피격)
    const ambush = s.equipPrefixes.ambush_pct || 0;
    if (ambush > 0 && s.ticksSinceLastHit >= 50) {
      dmg = Math.round(dmg * (1 + ambush / 100));
      s.ticksSinceLastHit = 0;
      addLog(s, `[각성] 다음 공격 +${ambush}%`);
    }
    // 신중한 (miss_combo_pct) — 누적 빗나감 1회당 +pct%
    const missCombo = s.equipPrefixes.miss_combo_pct || 0;
    if (missCombo > 0 && s.missStack > 0) {
      const bonus = missCombo * s.missStack;
      dmg = Math.round(dmg * (1 + bonus / 100));
      addLog(s, `[신중한] +${bonus}% (×${s.missStack})`);
      s.missStack = 0;
    }
    // 회피의 (evasion_burst_pct) — 직전 회피 성공 시 다음 공격 +pct%
    const dodgeBurst = s.equipPrefixes.evasion_burst_pct || 0;
    if (dodgeBurst > 0 && s.dodgeBurstPending) {
      dmg = Math.round(dmg * (1 + dodgeBurst / 100));
      addLog(s, `[회피의] +${dodgeBurst}%`);
      s.dodgeBurstPending = false;
    }
  }
  // shadow_strike: 전투 시작 후 첫 스킬 데미지 증가
  if (consume && s.hasFirstSkill) {
    const shadowStrike = getPassive(s, 'shadow_strike');
    if (shadowStrike > 0) {
      dmg = Math.round(dmg * (1 + shadowStrike / 100));
      s.hasFirstSkill = false;
      addLog(s, `[그림자 일격] 첫 스킬 +${shadowStrike}%`);
    }
  }
  // combo_kill_bonus: 연속킬 데미지 보너스 (최대 5중첩)
  const comboBonus = getPassive(s, 'combo_kill_bonus');
  if (comboBonus > 0 && s.comboKills > 0) {
    const stacks = Math.min(5, s.comboKills);
    dmg = Math.round(dmg * (1 + (comboBonus * stacks) / 100));
  }
  // speed_to_dmg: SPD → ATK 변환
  const speedToDmg = getPassive(s, 'speed_to_dmg');
  if (speedToDmg > 0) {
    const spdBonus = Math.round(s.playerStats.spd * speedToDmg / 100);
    if (spdBonus > 0) dmg += spdBonus;
  }
  // 크리 추가 배율 (crit_damage 패시브 + 날카로움)
  if (isCrit) {
    const critDmgBonus = getCritDmgBonus(s);
    if (critDmgBonus > 0) dmg = Math.round(dmg * (1 + critDmgBonus / 100));
    // assassin_execute: 치명타 시 적 HP 15% 이하면 즉사 확률
    const execute = getPassive(s, 'assassin_execute');
    if (execute > 0 && s.monsterHp > 0 && s.monsterHp <= s.monsterMaxHp * 0.15) {
      if (Math.random() * 100 < execute) {
        dmg = s.monsterHp + 1;
        addLog(s, `[그림자 처형] 즉사!`);
      }
    }
  }
  return dmg;
}

// 버프/디버프 스킬에 damage_mult > 0이면 동시에 데미지도 처리 (1턴 손해 방지)
// 일반 'damage' 케이스의 증폭 파이프라인과 동일한 보정을 적용한다 — 클래스 고유 노드(judge_amp 등)
// 가 buff류 스킬에서 누락되는 문제를 막기 위함.
function dealBuffSkillDamage(s: ActiveSession, skill: SkillDef, useMatk: boolean): boolean {
  if (skill.damage_mult <= 0) return false;
  const armorPierce = getPassive(s, 'armor_pierce');
  const prefixDefReduce = s.equipPrefixes.def_reduce_pct || 0;
  const prefixDefPierce = s.equipPrefixes.def_pierce_pct || 0;
  const totalDefReduce = Math.min(80, armorPierce + prefixDefReduce + prefixDefPierce);
  const defModStats = totalDefReduce > 0 ? {
    ...s.monsterStats,
    def: Math.round(s.monsterStats.def * (1 - totalDefReduce / 100)),
    mdef: Math.round(s.monsterStats.mdef * (1 - totalDefReduce / 100)),
  } : s.monsterStats;
  const d = calcDamage(s.playerStats, defModStats, skill.damage_mult, useMatk, skill.flat_damage);
  if (d.miss) {
    addLog(s, `[${skill.name}] 빗나감!`);
    s.missStack = Math.min(5, s.missStack + 1);
    return true;
  }
  let dmg = d.damage;
  // damage_taken_up 디버프
  const dtUp = s.statusEffects.find(e => e.type === 'damage_taken_up' && e.source === 'player' && e.remainingActions > 0);
  if (dtUp) dmg = Math.round(dmg * (1 + dtUp.value / 100));
  // atk_buff (자가 공격력 버프)
  const atkBuff = s.statusEffects.find(e => e.type === 'atk_buff' && e.source === 'monster' && e.remainingActions > 0);
  if (atkBuff) dmg = Math.round(dmg * (1 + atkBuff.value / 100));
  // spell_amp (마법 증폭)
  const spellAmp = getPassive(s, 'spell_amp');
  if (spellAmp > 0) dmg = Math.round(dmg * (1 + spellAmp / 100));
  // judge_amp / holy_judge (성직자 공격 노드) — 심판/실드 데미지 등 누락 버그 수정
  const judgeAmp = getPassive(s, 'judge_amp') + getPassive(s, 'holy_judge');
  if (judgeAmp > 0 && s.className === 'cleric') dmg = Math.round(dmg * (1 + judgeAmp / 100));
  // 접두사: 광전사 (내 HP 30% 이하)
  const berserk = s.equipPrefixes.berserk_pct || 0;
  if (berserk > 0 && s.playerHp / s.playerMaxHp <= 0.3) dmg = Math.round(dmg * (1 + berserk / 100));
  // first_strike / ambush는 1회성 차지 — 버프류 동시 데미지에서는 발동·소비하지 않는다.
  // 사용자 의도: 메인 딜 스킬에 차지를 보존.
  // 크리 추가 배율
  if (d.crit) {
    const critDmgBonus = getCritDmgBonus(s);
    if (critDmgBonus > 0) dmg = Math.round(dmg * (1 + critDmgBonus / 100));
  }
  s.monsterHp -= dmg;
  addLog(s, `[${skill.name}] ${dmg} 데미지${d.crit ? '!' : ''}`);
  return true;
}

// 패시브 값 조회 — 동일 키가 여러 노드에 있으면 합산
function getPassive(s: ActiveSession, key: string): number {
  return s.passives.get(key) ?? 0;
}

export function buildPassiveMap(rows: { key: string; value: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of rows) {
    m.set(p.key, (m.get(p.key) ?? 0) + p.value);
  }
  return m;
}

// 총 도트 증폭% (노드+접두사 합산) — dot_to_crit 변환 계산용
function getTotalDotAmpRaw(s: ActiveSession): number {
  return getPassive(s, 'dot_amp') + getPassive(s, 'poison_amp') + getPassive(s, 'bleed_amp')
    + getPassive(s, 'burn_amp') + getPassive(s, 'holy_dot_amp')
    + getPassive(s, 'elemental_storm')
    + getPassive(s, 'poison_lord')
    + (s.equipPrefixes.dot_amp_pct || 0);
}

// 크리티컬 데미지 보너스% (dot_to_crit 변환 포함)
function getCritDmgBonus(s: ActiveSession): number {
  let bonus = getPassive(s, 'crit_damage') + (s.equipPrefixes.crit_dmg_pct || 0);
  const dotToCrit = getPassive(s, 'dot_to_crit');
  if (dotToCrit > 0) {
    bonus += Math.round(getTotalDotAmpRaw(s) * dotToCrit / 100);
  }
  return bonus;
}

function tickDownEffects(s: ActiveSession, actor: 'player' | 'monster', preActionIds?: Set<string>) {
  for (const eff of s.statusEffects) {
    if (eff.source === actor && eff.remainingActions > 0) {
      // 쉴드는 몬스터 턴에 감소하지 않음 — 플레이어 턴에만 감소 (아래 tickShield에서 처리)
      if (eff.type === 'shield') continue;
      // 같은 액션 사이클에서 새로 적용된 효과는 즉시 감소시키지 않는다 (1틱 손실 방지)
      if (preActionIds && !preActionIds.has(eff.id)) continue;
      eff.remainingActions--;
    }
  }
  s.statusEffects = s.statusEffects.filter(e => e.remainingActions > 0 || e.type === 'resurrect');
}

// 쉴드 전용 턴 감소 — 플레이어 행동 시에만 호출
function tickShield(s: ActiveSession) {
  for (const eff of s.statusEffects) {
    if (eff.type === 'shield' && eff.source === 'monster' && eff.remainingActions > 0) {
      eff.remainingActions--;
      if (eff.remainingActions <= 0) {
        addLog(s, `실드 지속시간 만료`);
      }
    }
  }
  s.statusEffects = s.statusEffects.filter(e => e.remainingActions > 0 || e.type === 'resurrect');
}

// ── 도트 데미지 처리 ──
// 계산식은 combat/shared.ts의 calcDotTickDamage에 있음 (레이드와 공유).
// 여기서는 세션에서 컨텍스트(방어/증폭/저항)를 수집해서 호출하고, 결과를 HP에 반영한다.
function processDots(s: ActiveSession, target: 'player' | 'monster') {
  const useMatk = MATK_CLASSES.has(s.className);

  let defenderDef: number;
  let dotAmpPct = 0;
  let dotResistPct = 0;

  if (target === 'monster') {
    const armorPierce = getPassive(s, 'armor_pierce');
    const prefixDefReduce = s.equipPrefixes.def_reduce_pct || 0;
    const prefixDefPierce = s.equipPrefixes.def_pierce_pct || 0;
    const totalPierce = Math.min(80, armorPierce + prefixDefReduce + prefixDefPierce);
    let monsterDef = useMatk ? s.monsterStats.mdef : s.monsterStats.def;
    if (totalPierce > 0) monsterDef = Math.round(monsterDef * (1 - totalPierce / 100));
    defenderDef = monsterDef;
    dotAmpPct = getTotalDotAmpRaw(s);
    const dotPenalty = getPassive(s, 'dot_penalty');
    if (dotPenalty > 0) dotAmpPct -= dotPenalty;
  } else {
    defenderDef = s.playerStats.def;
    dotResistPct = getPassive(s, 'dot_resist');
  }

  const result = calcDotTickDamage(s.statusEffects, target, { defenderDef, dotAmpPct, dotResistPct });
  if (result.totalDamage <= 0) return;

  if (target === 'monster') {
    s.monsterHp -= result.totalDamage;
    addLog(s, `[도트] 몬스터에게 ${result.totalDamage} 데미지 (${result.count}중첩, 방어 50% 무시)`);
  } else {
    s.playerHp -= result.totalDamage;
    addLog(s, `[도트] ${result.totalDamage} 데미지를 받았다 (${result.count}중첩, 방어 50% 무시)`);
  }
}

// ── 스킬 실행 ──
// 마법 클래스: matk 사용 고정
const MATK_CLASSES = new Set(['mage', 'cleric', 'summoner']);
const MAX_SUMMONS = 3;

// ── 소환수 처리 ──
function processSummons(s: ActiveSession) {
  const summons = s.statusEffects.filter(e => e.type === 'summon' && e.source === 'player' && e.remainingActions > 0);
  if (summons.length === 0) return;

  const matk = s.playerStats.matk;
  const summonAmp = getPassive(s, 'summon_amp');
  const summonDouble = getPassive(s, 'summon_double_hit');
  // summon_buff 효과 (지휘/군주의 위엄)
  const buffEff = s.statusEffects.find(e => e.type === 'summon_buff_active' && e.remainingActions > 0);
  const buffMult = buffEff ? (1 + buffEff.value / 100) : 1.0;
  // summon_frenzy (야수의 분노 — 2회 공격)
  const frenzyEff = s.statusEffects.find(e => e.type === 'summon_frenzy_active' && e.remainingActions > 0);
  const hits = frenzyEff ? 2 : 1;

  // v0.9.6 신규 노드 효과: 원소/오오라/타입 (per-summon element 적용)
  const auraMultiplier = 1 + (getPassive(s, 'aura_multiplier') > 0 ? 1 : 0);
  const allElementDmg = getPassive(s, 'summon_all_element_dmg');
  const auraDmg = getPassive(s, 'aura_dmg') * auraMultiplier;
  const dpsAtk = getPassive(s, 'summon_dps_atk');
  const hybridAll = getPassive(s, 'summon_hybrid_all');
  const elementSynergy = getPassive(s, 'element_synergy');

  // 현재 필드에 소환된 고유 원소 수 — 시너지용
  const activeElements = new Set(summons.map(sm => sm.element).filter(Boolean));
  const synergyBonus = activeElements.size >= 2 ? elementSynergy : 0;

  // 원소별 보너스 테이블 (summon 하나가 해당 원소면 이 값들 적용)
  function elementBonuses(el: string | undefined) {
    if (!el) return { dmg: 0, pen: 0, crit: 0, critDmg: 0, lifesteal: 0 };
    return {
      dmg: getPassive(s, `summon_${el}_dmg`),
      pen: getPassive(s, `summon_${el}_pen`),
      crit: getPassive(s, `summon_${el}_crit`),
      critDmg: getPassive(s, `summon_${el}_crit_dmg`),
      lifesteal: el === 'dark' ? getPassive(s, 'summon_dark_lifesteal') : 0,
    };
  }

  // 글로벌(모든 소환수 적용)
  const globalDmgBonus = summonAmp + allElementDmg + auraDmg + dpsAtk + hybridAll + synergyBonus;
  const globalPen = getPassive(s, 'aura_pen') * auraMultiplier;
  const globalCrit = getPassive(s, 'aura_crit') * auraMultiplier;
  const globalLifesteal = getPassive(s, 'aura_lifesteal') * auraMultiplier;
  // 원소 폭발 (원소 군주 huge): 15% 확률 추가 데미지 100%
  const elementBurst = getPassive(s, 'summon_element_burst');

  let totalSummonDmg = 0;
  let totalLifesteal = 0;
  for (const sm of summons) {
    const eb = elementBonuses(sm.element);
    const dmgBonus = globalDmgBonus + eb.dmg;
    const penetration = globalPen + eb.pen;
    const critChance = globalCrit + eb.crit;
    const critDmgBonus = eb.critDmg;
    const lifesteal = globalLifesteal + eb.lifesteal;

    const mult = sm.value / 100; // value = 퍼센트 (80 = 0.8x)
    for (let h = 0; h < hits; h++) {
      let dmg = Math.round(matk * mult * buffMult * (1 + dmgBonus / 100));
      // 방어 적용 (관통 % 만큼 방어 무시)
      const defVal = s.monsterStats.mdef;
      const effectiveDef = defVal * (1 - Math.min(100, penetration) / 100);
      dmg = Math.max(1, dmg - Math.round(effectiveDef * 0.5));
      // ±10% 랜덤
      dmg = Math.round(dmg * (0.9 + Math.random() * 0.2));
      // 치명타
      if (critChance > 0 && Math.random() * 100 < critChance) {
        dmg = Math.round(dmg * (1.5 + critDmgBonus / 100));
      }
      // 20% 확률 2회 타격 (만물의 군주)
      if (summonDouble > 0 && Math.random() * 100 < summonDouble) {
        dmg *= 2;
      }
      // 원소 폭발 (원소 군주) — 원소 있는 소환수만
      if (sm.element && elementBurst > 0 && Math.random() * 100 < elementBurst) {
        dmg = Math.round(dmg * 2);
      }
      s.monsterHp -= dmg;
      totalSummonDmg += dmg;
      if (lifesteal > 0) totalLifesteal += Math.round(dmg * lifesteal / 100);
    }
  }
  // 흡혈 회복
  if (totalLifesteal > 0) {
    s.playerHp = Math.min(s.playerMaxHp, s.playerHp + totalLifesteal);
  }
  // 치유 오오라: 소환수 공격 당 플레이어 HP 회복 (% of max)
  const auraHeal = getPassive(s, 'aura_heal') * auraMultiplier + getPassive(s, 'summon_holy_heal');
  if (auraHeal > 0 && summons.length > 0) {
    const heal = Math.round(s.playerMaxHp * auraHeal / 1000); // 20 → 2% of max hp
    if (heal > 0) s.playerHp = Math.min(s.playerMaxHp, s.playerHp + heal);
  }
  if (totalSummonDmg > 0) {
    addLog(s, `[소환수 x${summons.length}] ${totalSummonDmg.toLocaleString()} 데미지${frenzyEff ? ' (분노)' : ''}`);
  }
  // 수호수 힐
  const healSummon = summons.find(e => e.dotMult === -1); // dotMult=-1 마커로 수호수 식별
  if (healSummon) {
    const heal = Math.round(s.playerMaxHp * 0.05);
    s.playerHp = Math.min(s.playerMaxHp, s.playerHp + heal);
    addLog(s, `[수호수] HP +${heal} 회복`);
  }
}

// 도적 독의 공명: 10 게이지 도달 시 독 폭발 (남은 도트 합계 × 3 데미지, 스택은 유지)
// executeSkill 시작 + 기본공격(default attack) 시작 양쪽에서 호출되어
// 스킬을 안 쓰는 턴에도 발동 가능.
function tryPoisonResonanceBurst(s: ActiveSession): void {
  if (s.className !== 'rogue' || s.poisonResonance < 10) return;
  const poisons = s.statusEffects.filter(e =>
    e.type === 'poison' && e.source === 'player' && e.remainingActions > 0
  );
  let burst = 0;
  for (const p of poisons) burst += p.value * p.remainingActions * 3;
  if (burst > 0) {
    s.monsterHp -= burst;
    // raw 숫자로 출력 — 콤마 포맷이 들어가면 클라 DPS 미터 regex가 마지막 자리만 캡처함
    addLog(s, `💀 [독의 공명] 폭발! ${burst} 데미지`);
    s.poisonResonance = 0;
  }
}

async function executeSkill(s: ActiveSession, skill: SkillDef): Promise<void> {
  const useMatk = MATK_CLASSES.has(s.className);

  tryPoisonResonanceBurst(s);

  // 쿨다운 설정
  // cooldown_reduce: 퍼센트 감소 (예: 13 → 13%)
  // mana_flow: 추가 턴 수 감소 (예: 1 → -1턴)
  // 마법사 마나의 흐름 버스트 중에는 쿨다운 감소 적용 안 함 (기본 쿨다운만 저장)
  if (skill.cooldown_actions > 0) {
    const manaBurst = s.className === 'mage' && s.manaFlowActive > 0;
    let cd = skill.cooldown_actions;
    if (!manaBurst) {
      const cdReducePct = getPassive(s, 'cooldown_reduce');
      const cdFlat = getPassive(s, 'mana_flow');
      // 소환사 신규: summon_*_cdr 는 소환 계열 스킬에만 적용
      const isSummonSkill = skill.effect_type === 'summon' || skill.effect_type.startsWith('summon_');
      const summonCdFlat = isSummonSkill ? (
        getPassive(s, 'summon_support_cdr') +
        getPassive(s, 'summon_all_cdr') +
        getPassive(s, 'summon_tank_cdr') +
        getPassive(s, 'summon_dps_cdr') +
        getPassive(s, 'summon_hybrid_cdr')
      ) : 0;
      if (cdReducePct > 0) cd = Math.floor(cd * (1 - cdReducePct / 100));
      if (cdFlat > 0) cd = cd - cdFlat;
      if (summonCdFlat > 0) cd = cd - summonCdFlat;
    }
    cd = Math.max(1, cd);
    s.skillCooldowns.set(skill.id, cd);
  }
  // LRU: 마지막 사용 액션 카운트 기록
  s.skillLastUsed.set(skill.id, s.actionCount);

  // 일일퀘 스킬 사용 트래킹 (버프 자유행동은 스킵 — 성능 최적화)
  if (skill.kind !== 'buff') {
    try { trackDailyQuestProgress(s.characterId, 'use_skills', 1); } catch {}
  }

  // 패시브: spell_amp (스킬 데미지 증폭 — 전 직업 적용), armor_pierce (방어 무시)
  const spellAmp = getPassive(s, 'spell_amp');
  const armorPierce = getPassive(s, 'armor_pierce');
  // 접두사: 약화(def_reduce_pct) + 꿰뚫는(def_pierce_pct)
  const prefixDefReduce = s.equipPrefixes.def_reduce_pct || 0;
  const prefixDefPierce = s.equipPrefixes.def_pierce_pct || 0;

  switch (skill.effect_type) {
    case 'damage':
    case 'self_damage_pct':
    case 'lifesteal':
    case 'crit_bonus':
    case 'self_hp_dmg':
    case 'double_chance':
    case 'hp_pct_damage': {
      const criBonus = skill.effect_type === 'crit_bonus' ? skill.effect_value : 0;
      // armor_pierce 적용: 몬스터 방어력 감소 복사본
      // 분노의 일격: 방어 50% 추가 무시
      // 절대 파괴 / 대멸절: 방어 100% 무시 (고정 피어스)
      const furyPierce =
        skill.name === '분노의 일격' ? 50 :
        (skill.name === '절대 파괴' || skill.name === '대멸절') ? 100 : 0;
      const totalDefReduce = Math.min(100, armorPierce + prefixDefReduce + prefixDefPierce + furyPierce);
      const defModStats = totalDefReduce > 0 ? {
        ...s.monsterStats,
        def: Math.round(s.monsterStats.def * (1 - totalDefReduce / 100)),
        mdef: Math.round(s.monsterStats.mdef * (1 - totalDefReduce / 100)),
      } : s.monsterStats;
      // 마나 폭주: INT 1당 1000 고정 데미지 추가 (증폭 대상 — flat_damage로 전달)
      const manaOverloadFlat = skill.name === '마나 폭주' ? (s.playerStats.int || 0) * 1000 : 0;
      const totalFlat = skill.flat_damage + manaOverloadFlat;
      const d = calcDamage(s.playerStats, defModStats, skill.damage_mult, useMatk, totalFlat, criBonus);
      // 도적 기습: 치명타 확정 상태 — 원래 크리가 아니었다면 강제로 2배 + 크리 플래그
      const critGuaranteed = s.statusEffects.find(e => e.type === 'crit_guaranteed' && e.source === 'monster' && e.remainingActions > 0);
      if (critGuaranteed && !d.miss && !d.crit) {
        d.damage = Math.round(d.damage * 2); // 기본 크리 배율 200%
        d.crit = true;
        critGuaranteed.remainingActions = 0;
        addLog(s, `[치명타 확정] 발동`);
      }
      if (d.miss) {
        addLog(s, `[${skill.name}] 빗나감!`);
        s.missStack = Math.min(5, s.missStack + 1);
      } else {
        let dmg = d.damage;
        // 디버프: damage_taken_up (방패 강타 등 — 적이 받는 데미지 증가)
        const dtUp = s.statusEffects.find(e => e.type === 'damage_taken_up' && e.source === 'player' && e.remainingActions > 0);
        if (dtUp) dmg = Math.round(dmg * (1 + dtUp.value / 100));
        // 버프: atk_buff (전쟁의 함성 등 — 플레이어 공격력 증가)
        const atkBuff = s.statusEffects.find(e => e.type === 'atk_buff' && e.source === 'monster' && e.remainingActions > 0);
        if (atkBuff) dmg = Math.round(dmg * (1 + atkBuff.value / 100));
        // 패시브: spell_amp (마법 증폭)
        if (spellAmp > 0) dmg = Math.round(dmg * (1 + spellAmp / 100));
        // 패시브: judge_amp (성직자 공격 스킬 증폭) / holy_judge (신성 심판자)
        const judgeAmp = getPassive(s, 'judge_amp') + getPassive(s, 'holy_judge');
        if (judgeAmp > 0 && s.className === 'cleric') dmg = Math.round(dmg * (1 + judgeAmp / 100));
        // 마법사 고유 패시브: 도트(dot/poison) 걸린 적에게 +30%
        if (s.className === 'mage') {
          const monsterDot = s.statusEffects.some(e =>
            (e.type === 'dot' || e.type === 'poison') && e.source === 'player' && e.remainingActions > 0);
          if (monsterDot) { dmg = Math.round(dmg * 1.3); addLog(s, `[원소 침식] 도트 상태 +30%`); }
          // 마력 과부하: 자신 스피드 감소 디버프 중일 때 마법 데미지 +80%
          const selfSlow = s.statusEffects.some(e =>
            e.type === 'speed_mod' && e.source === 'monster' && e.value < 0 && e.remainingActions > 0);
          if (selfSlow) { dmg = Math.round(dmg * 1.8); addLog(s, `[마력 과부하] 과부하 상태 +80%`); }
        }
        // 성직자 심판자의 권능: 자신 실드 보유 시 +50% 추가
        if (skill.name === '심판자의 권능') {
          const ownShield = s.statusEffects.find(e => e.type === 'shield' && e.source === 'monster' && e.value > 0);
          if (ownShield) { dmg = Math.round(dmg * 1.5); addLog(s, `[심판자의 권능] 실드 보유 +50%`); }
        }
        // 도적 암흑의 심판: 적에게 걸린 독 스택당 +8% (독 없어도 베이스 강화)
        if (skill.name === '암흑의 심판') {
          const poisonStacks = s.statusEffects.filter(e => e.type === 'poison' && e.source === 'player' && e.remainingActions > 0).length;
          if (poisonStacks > 0) {
            dmg = Math.round(dmg * (1 + poisonStacks * 0.08));
            addLog(s, `[암흑의 심판] 독 ${poisonStacks}중첩 +${poisonStacks * 8}%`);
          }
        }
        // 접두사: 광전사 (내 HP 30% 이하)
        const berserk = s.equipPrefixes.berserk_pct || 0;
        let berserkProc = false;
        if (berserk > 0 && s.playerHp / s.playerMaxHp <= 0.3) {
          dmg = Math.round(dmg * (1 + berserk / 100));
          berserkProc = true;
        }
        // 접두사: 약점간파 (첫 공격)
        const firstStrike = s.equipPrefixes.first_strike_pct || 0;
        let firstStrikeProc = false;
        if (firstStrike > 0 && s.hasFirstStrike) {
          dmg = Math.round(dmg * (1 + firstStrike / 100));
          s.hasFirstStrike = false;
          firstStrikeProc = true;
        }
        // 접두사: 각성 (5초 이상 미피격 시)
        const ambush = s.equipPrefixes.ambush_pct || 0;
        let ambushProc = false;
        if (ambush > 0 && s.ticksSinceLastHit >= 50) {
          dmg = Math.round(dmg * (1 + ambush / 100));
          s.ticksSinceLastHit = 0;
          ambushProc = true;
        }
        if (berserkProc) addLog(s, `[광전사] 데미지 +${berserk}%`);
        if (firstStrikeProc) addLog(s, `[약점간파] 첫 공격 +${firstStrike}%`);
        if (ambushProc) addLog(s, `[각성] 다음 공격 +${ambush}%`);
        // 패시브: crit_damage (치명타 추가 배율) + 접두사: 날카로움(crit_dmg_pct)
        if (d.crit) {
          const critDmgBonus = getCritDmgBonus(s);
          if (critDmgBonus > 0) dmg = Math.round(dmg * (1 + critDmgBonus / 100));
          // 접두사: 재충전 (치명타 시 게이지 충전) — 최대 50% 캡
          const gaugeOnCrit = s.equipPrefixes.gauge_on_crit_pct || 0;
          if (gaugeOnCrit > 0) {
            const gain = Math.min(GAUGE_MAX * 0.5, GAUGE_MAX * gaugeOnCrit / 100);
            s.playerGauge = Math.min(GAUGE_MAX, s.playerGauge + gain);
            addLog(s, `[재충전] 게이지 +${Math.min(50, gaugeOnCrit)}%`);
          }
        }
        // 전사 분노 폭발 (rage 100 이상 → ×3)
        // rage_reduce 패시브: 폭발 후 잔여 분노 (소모량 -N%)
        let rageProc = false;
        if (s.className === 'warrior' && s.rage >= 100) {
          dmg = Math.round(dmg * 3);
          const rageReduce = getPassive(s, 'rage_reduce');
          s.rage = rageReduce > 0 ? Math.round(s.rage * (rageReduce / 100)) : 0;
          rageProc = true;
        }
        s.monsterHp -= dmg;
        if (rageProc) {
          addLog(s, `🔥 [분노 폭발!] ${dmg} 데미지 (×3)`);
        } else if (d.crit) {
          const critDmgPct = 200 + getCritDmgBonus(s);
          addLog(s, `[${skill.name}] ${dmg} 데미지! (치명타 ${critDmgPct}%)`);
        } else {
          addLog(s, `[${skill.name}] ${dmg} 데미지`);
        }
        // 전사 분노 축적 (기본기 +10, 스킬 +15)
        if (s.className === 'warrior' && !rageProc) {
          const rageGain = skill.cooldown_actions === 0 ? 10 : 15;
          s.rage = Math.min(100, s.rage + rageGain);
        }

        // 접두사: 흡혈귀(lifesteal_pct) — 데미지의 N%를 회복
        const prefixLifesteal = s.equipPrefixes.lifesteal_pct || 0;
        if (prefixLifesteal > 0 && dmg > 0) {
          const heal = Math.round(dmg * prefixLifesteal / 100);
          if (heal > 0) {
            s.playerHp = Math.min(s.playerMaxHp, s.playerHp + heal);
            addLog(s, `[흡혈] HP +${heal}`);
          }
        }

        // 패시브: crit_lifesteal (치명타 시 흡혈)
        if (d.crit) {
          const critLifesteal = getPassive(s, 'crit_lifesteal');
          if (critLifesteal > 0) {
            const critHeal = Math.round(dmg * critLifesteal / 100);
            s.playerHp = Math.min(s.playerMaxHp, s.playerHp + critHeal);
            addLog(s, `치명 흡혈 HP +${critHeal}`);
          }
        }

        // 패시브: bleed_on_hit (타격 시 출혈)
        const bleedChance = getPassive(s, 'bleed_on_hit');
        if (bleedChance > 0 && Math.random() * 100 < bleedChance) {
          const bleedBase = useMatk ? s.playerStats.matk : s.playerStats.atk;
          const bleedDmg = Math.round(bleedBase * 1.2);
          addEffect(s, { type: 'dot', value: bleedDmg, remainingActions: 3, source: 'player', dotMult: 1.2, dotUseMatk: useMatk });
          addLog(s, `출혈! ${bleedDmg}/행동 x3 (방어 50% 무시)`);
        }


        if (skill.effect_type === 'lifesteal') {
          let heal = Math.round(dmg * skill.effect_value / 100);
          const lsAmp = getPassive(s, 'lifesteal_amp');
          if (lsAmp > 0) heal = Math.round(heal * (1 + lsAmp / 100));
          s.playerHp = Math.min(s.playerMaxHp, s.playerHp + heal);
          // 흡혈 참격: 흡수한 데미지만큼 추가 데미지
          s.monsterHp -= heal;
          addLog(s, `[${skill.name}] HP +${heal} 흡혈, 추가 데미지 +${heal}`);
        }
        if (skill.effect_type === 'hp_pct_damage') {
          if (isDummyMonster(s)) {
            addLog(s, `[${skill.name}] HP% 데미지 무효 (허수아비)`);
          } else if (s.guildBossRunId) {
            addLog(s, `[${skill.name}] HP% 데미지 무효 (길드 보스)`);
          } else {
            const extra = Math.round(Math.max(0, s.monsterHp) * skill.effect_value / 100);
            s.monsterHp -= extra;
            addLog(s, `[${skill.name}] 추가 고정 ${extra} 데미지`);
          }
        }
        if (skill.effect_type === 'self_hp_dmg') {
          const extra = Math.round(s.playerMaxHp * skill.effect_value / 100);
          s.monsterHp -= extra;
          addLog(s, `[${skill.name}] 자신 HP ${skill.effect_value}% 추가 ${extra} 데미지`);
        }
        if (skill.effect_type === 'double_chance') {
          if (Math.random() * 100 < skill.effect_value) {
            const d2 = calcDamage(s.playerStats, defModStats, skill.damage_mult, useMatk, skill.flat_damage);
            if (!d2.miss) {
              let dmg2 = d2.damage;
              if (spellAmp > 0) dmg2 = Math.round(dmg2 * (1 + spellAmp / 100));
              if (d2.crit) {
                const critDmgBonus = getCritDmgBonus(s);
                if (critDmgBonus > 0) dmg2 = Math.round(dmg2 * (1 + critDmgBonus / 100));
              }
              s.monsterHp -= dmg2;
              addLog(s, `[${skill.name}] 2회 발동! ${dmg2}${d2.crit ? '!' : ''}`);
            }
          }
        }

        // 패시브: extra_hit (추가 타격 확률)
        const extraHit = getPassive(s, 'extra_hit');
        if (extraHit > 0 && Math.random() * 100 < extraHit) {
          const d2 = calcDamage(s.playerStats, defModStats, skill.damage_mult * 0.5, useMatk);
          if (!d2.miss) {
            s.monsterHp -= d2.damage;
            addLog(s, `추가 타격! ${d2.damage}`);
          }
        }
        // blade_flurry: 칼날 추가타 확률 (일반 공격에 추가 타격)
        const bladeFlurry = getPassive(s, 'blade_flurry');
        if (bladeFlurry > 0 && Math.random() * 100 < bladeFlurry) {
          const d3 = calcDamage(s.playerStats, defModStats, skill.damage_mult * 0.6, useMatk);
          if (!d3.miss) {
            const dmg3 = applyDamagePrefixes(s, d3.damage, d3.crit, { consumeOneShot: false, skillName: skill.name });
            s.monsterHp -= dmg3;
            addLog(s, `[칼날 추가타] ${dmg3}${d3.crit ? '!' : ''}`);
          }
        }
      }
      if (skill.effect_type === 'self_damage_pct') {
        const cost = Math.round(s.playerMaxHp * skill.effect_value / 100);
        s.playerHp -= cost;
        // 분노의 일격: 소모한 체력만큼 추가 데미지
        s.monsterHp -= cost;
        addLog(s, `[${skill.name}] 자신 HP -${cost}, 추가 데미지 +${cost}`);
      }
      break;
    }

    case 'multi_hit': {
      const hits = Math.round(skill.effect_value) + getPassive(s, 'extra_hit');
      const chainAmp = getPassive(s, 'chain_action_amp');
      const bladeStormAmp = getPassive(s, 'blade_storm_amp');
      const multiAmp = s.equipPrefixes.multi_hit_amp_pct || 0;
      const baseChain = chainAmp > 0 ? skill.damage_mult * (1 + chainAmp / 100) : skill.damage_mult;
      const hitMult = multiAmp > 0 ? baseChain * (1 + multiAmp / 100) : baseChain;
      const gaugeOnCritMulti = s.equipPrefixes.gauge_on_crit_pct || 0;
      let firstLandedHit = true;
      let landedCount = 0;
      for (let i = 0; i < hits; i++) {
        const stormMult = bladeStormAmp > 0 ? hitMult * (1 + (bladeStormAmp * landedCount) / 100) : hitMult;
        const d = calcDamage(s.playerStats, s.monsterStats, stormMult, useMatk, skill.flat_damage);
        if (d.miss) {
          addLog(s, `[${skill.name}] ${i + 1}타 빗나감!`);
          s.missStack = Math.min(5, s.missStack + 1);
        } else {
          let dmg = applyDamagePrefixes(s, d.damage, d.crit, {
            consumeOneShot: firstLandedHit,
            skillName: skill.name,
          });
          firstLandedHit = false;
          landedCount++;
          s.monsterHp -= dmg;
          if (d.crit) {
            const critDmgPct = 200 + getCritDmgBonus(s);
            addLog(s, `[${skill.name}] ${i + 1}타 ${dmg} 데미지! (치명타 ${critDmgPct}%)`);
          } else {
            addLog(s, `[${skill.name}] ${i + 1}타 ${dmg}`);
          }
          // 접두사: 재충전 (치명타 시 게이지 충전) — multi_hit 각 타격마다 적용, 최대 50% 캡
          if (d.crit && gaugeOnCritMulti > 0) {
            const gain = Math.min(GAUGE_MAX * 0.5, GAUGE_MAX * gaugeOnCritMulti / 100);
            s.playerGauge = Math.min(GAUGE_MAX, s.playerGauge + gain);
            addLog(s, `[재충전] ${i + 1}타 치명타 → 게이지 +${Math.min(50, gaugeOnCritMulti)}%`);
          }
          // 전사 분노 축적 — 각 적중마다 +5 (3연타 기본 = 15, 추가 타 시 더 많이 충전)
          if (s.className === 'warrior') {
            s.rage = Math.min(100, s.rage + 5);
          }
        }
      }
      // 무쌍난무: 25% / 전장의 광란: 50% 확률로 모든 스킬 쿨다운 초기화 (자신 제외)
      const resetChance = skill.name === '무쌍난무' ? 0.25 : (skill.name === '전장의 광란' ? 0.50 : 0);
      if (resetChance > 0 && Math.random() < resetChance) {
        for (const skId of Array.from(s.skillCooldowns.keys())) {
          if (skId !== skill.id) s.skillCooldowns.delete(skId);
        }
        addLog(s, `[${skill.name}] 격앙! 다른 스킬 쿨다운 초기화!`);
      }
      break;
    }

    case 'multi_hit_poison': {
      const hits = Math.round(skill.effect_value);
      const dotBase = useMatk ? s.playerStats.matk : s.playerStats.atk;
      const POISON_MULTI_MULT = 2.0;
      const dotDmg = Math.round(dotBase * POISON_MULTI_MULT);
      const multiAmpPoison = s.equipPrefixes.multi_hit_amp_pct || 0;
      const poisonHitMult = multiAmpPoison > 0 ? skill.damage_mult * (1 + multiAmpPoison / 100) : skill.damage_mult;
      const gaugeOnCritMultiPoison = s.equipPrefixes.gauge_on_crit_pct || 0;
      let firstLandedHitMP = true;
      for (let i = 0; i < hits; i++) {
        const d = calcDamage(s.playerStats, s.monsterStats, poisonHitMult, useMatk);
        if (!d.miss) {
          const dmg = applyDamagePrefixes(s, d.damage, d.crit, {
            consumeOneShot: firstLandedHitMP,
            skillName: skill.name,
          });
          firstLandedHitMP = false;
          s.monsterHp -= dmg;
          addLog(s, `[${skill.name}] ${i + 1}타 ${dmg}${d.crit ? '!' : ''}`);
          const poisonLordExt = getPassive(s, 'poison_lord') > 0 ? 3 : 0;
          addEffect(s, { type: 'poison', value: dotDmg, remainingActions: 3 + poisonLordExt, source: 'player', dotMult: POISON_MULTI_MULT, dotUseMatk: useMatk });
          // 접두사: 재충전 (치명타 시 게이지 충전) — 타격마다 적용, 최대 50% 캡
          if (d.crit && gaugeOnCritMultiPoison > 0) {
            const gain = Math.min(GAUGE_MAX * 0.5, GAUGE_MAX * gaugeOnCritMultiPoison / 100);
            s.playerGauge = Math.min(GAUGE_MAX, s.playerGauge + gain);
            addLog(s, `[재충전] ${i + 1}타 치명타 → 게이지 +${Math.min(50, gaugeOnCritMultiPoison)}%`);
          }
        }
      }
      addLog(s, `[${skill.name}] 독 ${dotDmg}/행동 x3행동 (방어 50% 무시)`);
      break;
    }

    case 'dot': {
      const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk, skill.flat_damage);
      if (!d.miss) {
        const dmg = applyDamagePrefixes(s, d.damage, d.crit, { skillName: skill.name });
        s.monsterHp -= dmg;
        addLog(s, `[${skill.name}] ${dmg} 데미지${d.crit ? '!' : ''}`);
        const dotBase = useMatk ? s.playerStats.matk : s.playerStats.atk;
        const DOT_SKILL_MULT = 2.0; // 화상 도트: 200% (1.56 → 2.0 상향)
        const dotDmg = Math.round(dotBase * DOT_SKILL_MULT);
        const stormExt = getPassive(s, 'elemental_storm') > 0 ? 1 : 0;
        const dotDuration = skill.effect_duration + stormExt;
        addEffect(s, { type: 'dot', value: dotDmg, remainingActions: dotDuration, source: 'player', dotMult: DOT_SKILL_MULT, dotUseMatk: useMatk });
        addLog(s, `[${skill.name}] 도트 ${dotDmg}/행동 x${dotDuration}행동 (방어 50% 무시)`);
        // 마법사 전용: DoT 즉발화 — 총 도트 데미지의 50%를 즉시 추가 (실사냥 1타킬 대응)
        if (s.className === 'mage') {
          const instantDot = Math.round(dotDmg * dotDuration * 0.5);
          if (instantDot > 0) {
            s.monsterHp -= instantDot;
            addLog(s, `[${skill.name}] 도트 즉발 +${instantDot}`);
          }
        }
        // effect_value > 0이면 N% 확률로 2회 발동 (운석 폭격 등)
        if (skill.effect_value > 0 && Math.random() * 100 < skill.effect_value) {
          const d2 = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk, skill.flat_damage);
          if (!d2.miss) {
            // one-shot(first_strike/ambush) 은 첫 타격에서 이미 소비
            const dmg2 = applyDamagePrefixes(s, d2.damage, d2.crit, { consumeOneShot: false, skillName: skill.name });
            s.monsterHp -= dmg2;
            addEffect(s, { type: 'dot', value: dotDmg, remainingActions: skill.effect_duration + stormExt, source: 'player', dotMult: DOT_SKILL_MULT, dotUseMatk: useMatk });
            addLog(s, `[${skill.name}] 2회 발동! ${dmg2}${d2.crit ? '!' : ''} +도트`);
          }
        }
      } else {
        addLog(s, `[${skill.name}] 빗나감!`);
      }
      break;
    }

    case 'poison': {
      const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk, skill.flat_damage);
      if (!d.miss) {
        const dmg = applyDamagePrefixes(s, d.damage, d.crit, { skillName: skill.name });
        s.monsterHp -= dmg;
        addLog(s, `[${skill.name}] ${dmg} 데미지${d.crit ? '!' : ''}`);
      }
      const dotBase = useMatk ? s.playerStats.matk : s.playerStats.atk;
      const POISON_MULT = 2.0;
      const dotDmg = Math.round(dotBase * POISON_MULT);
      const poisonLordExt2 = getPassive(s, 'poison_lord') > 0 ? 3 : 0;
      addEffect(s, { type: 'poison', value: dotDmg, remainingActions: skill.effect_duration + poisonLordExt2, source: 'player', dotMult: POISON_MULT, dotUseMatk: useMatk });
      addLog(s, `[${skill.name}] 독 ${dotDmg}/행동 x${skill.effect_duration}행동 (방어 50% 무시)`);
      // 스피드 감소
      if (skill.effect_value > 0) {
        addEffect(s, { type: 'speed_mod', value: -skill.effect_value, remainingActions: skill.effect_duration, source: 'player' });
        addLog(s, `[${skill.name}] 스피드 ${skill.effect_value}% 감소`);
      }
      break;
    }

    case 'poison_burst': {
      const poisons = s.statusEffects.filter(e => e.type === 'poison' && e.source === 'player');
      let totalBurst = 0;
      for (const p of poisons) {
        totalBurst += Math.round(p.value * skill.effect_value / 100);
      }
      // 패시브: poison_burst_amp
      const burstAmp = getPassive(s, 'poison_burst_amp');
      if (burstAmp > 0) totalBurst = Math.round(totalBurst * (1 + burstAmp / 100));
      // 독이 없어도 기본 데미지 보장 (베이스 +4배 ATK, 들쭉날쭉 완화)
      if (totalBurst <= 0) {
        const baseAtk = MATK_CLASSES.has(s.className) ? s.playerStats.matk : s.playerStats.atk;
        totalBurst = Math.round(baseAtk * 4);
        addLog(s, `[${skill.name}] 독 없음 → 기본 공격 ${totalBurst}`);
      }
      s.monsterHp -= totalBurst;
      if (poisons.length > 0) {
        addLog(s, `[${skill.name}] 독 폭발! ${totalBurst} 데미지 (독 유지)`);
      }
      break;
    }

    case 'speed_mod':
    case 'self_speed_mod': {
      dealBuffSkillDamage(s, skill, useMatk);
      if (skill.effect_type === 'speed_mod') {
        // frost_amp: 냉기 스피드 감소 효과 증폭
        const frostAmp = getPassive(s, 'frost_amp');
        const slowValue = frostAmp > 0 ? Math.round(skill.effect_value * (1 + frostAmp / 100)) : skill.effect_value;
        addEffect(s, { type: 'speed_mod', value: slowValue, remainingActions: skill.effect_duration, source: 'player' });
        addLog(s, `[${skill.name}] 적 스피드 ${slowValue}% ${skill.effect_duration}행동`);
      } else {
        addEffect(s, { type: 'speed_mod', value: skill.effect_value, remainingActions: skill.effect_duration, source: 'monster' }); // affects player
        addLog(s, `[${skill.name}] 자신 스피드 ${skill.effect_value}% ${skill.effect_duration}행동`);
      }
      break;
    }

    case 'gauge_reset': {
      if (s.guildBossRunId) {
        addLog(s, `[${skill.name}] 길드 보스는 게이지 조작 면역`);
        break;
      }
      s.monsterGauge = 0;
      const gcAmp = getPassive(s, 'gauge_control_amp');
      const stunChance = skill.effect_value * (1 + gcAmp / 100);
      addLog(s, `[${skill.name}] 적 게이지 리셋!`);
      if (Math.random() * 100 < stunChance) {
        if (hasEffect(s, 'player', 'cc_immune')) {
          addLog(s, `[${skill.name}] 몬스터 상태이상 면역!`);
        } else if (monsterResistsCC(s.monsterLevel)) {
          addLog(s, `[${skill.name}] 몬스터가 CC에 저항! (고레벨)`);
        } else if (Math.random() < 0.5) {
          addLog(s, `[${skill.name}] 몬스터가 기절에 저항!`);
        } else {
          addEffect(s, { type: 'stun', value: 0, remainingActions: 1, source: 'player' });
          addEffect(s, { type: 'cc_immune', value: 0, remainingActions: 1 + 3, source: 'player' });
          addLog(s, `[${skill.name}] 조작불능!`);
        }
      }
      break;
    }

    case 'stun': {
      const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk, skill.flat_damage);
      if (!d.miss) {
        // 접두사 공통: 광전사/약점간파/각성/치명 데미지
        const dmg = applyDamagePrefixes(s, d.damage, d.crit, { skillName: skill.name });
        s.monsterHp -= dmg;
        if (d.crit) {
          const critDmgPct = 200 + getCritDmgBonus(s);
          addLog(s, `[${skill.name}] ${dmg} 데미지! (치명타 ${critDmgPct}%)`);
        } else {
          addLog(s, `[${skill.name}] ${dmg} 데미지`);
        }
        // 접두사: 재충전 (치명타 시 게이지 충전) — G4 버그 수정, 최대 50% 캡
        if (d.crit) {
          const gaugeOnCritStun = s.equipPrefixes.gauge_on_crit_pct || 0;
          if (gaugeOnCritStun > 0) {
            const gain = Math.min(GAUGE_MAX * 0.5, GAUGE_MAX * gaugeOnCritStun / 100);
            s.playerGauge = Math.min(GAUGE_MAX, s.playerGauge + gain);
            addLog(s, `[재충전] 게이지 +${Math.min(50, gaugeOnCritStun)}%`);
          }
        }
        // 방패 강타: 자신 최대 HP의 15% 고정 추가 데미지
        if (skill.name === '방패 강타') {
          const bonus = Math.round(s.playerMaxHp * 0.15);
          s.monsterHp -= bonus;
          addLog(s, `[${skill.name}] 체력 비례 고정 +${bonus} 데미지`);
        }
        if (hasEffect(s, 'player', 'cc_immune')) {
          addLog(s, `[${skill.name}] 몬스터 상태이상 면역!`);
        } else if (monsterResistsCC(s.monsterLevel)) {
          addLog(s, `[${skill.name}] 몬스터가 CC에 저항! (고레벨)`);
        } else if (Math.random() < 0.5) {
          addLog(s, `[${skill.name}] 몬스터가 기절에 저항!`);
        } else {
          const stunExt = getPassive(s, 'stun_extend');
          const stunDur = skill.effect_duration + stunExt;
          addEffect(s, { type: 'stun', value: 0, remainingActions: stunDur, source: 'player' });
          addEffect(s, { type: 'cc_immune', value: 0, remainingActions: stunDur + 3, source: 'player' });
          addLog(s, `[${skill.name}] 스턴 ${stunDur}행동!`);
        }
        // 방패 강타: 적이 받는 데미지 20% 증가 3턴
        if (skill.name === '방패 강타') {
          addEffect(s, { type: 'damage_taken_up', value: 20, remainingActions: 3, source: 'player' });
          addLog(s, `[${skill.name}] 적 받는 데미지 +20% 3턴!`);
        }
      } else {
        addLog(s, `[${skill.name}] 빗나감!`);
      }
      // 신성 사슬: 기절 + 자신 모든 능력치 20% 상승 3행동
      if (skill.name === '신성 사슬') {
        addEffect(s, { type: 'atk_buff', value: 20, remainingActions: 3, source: 'monster' });
        addEffect(s, { type: 'damage_reduce', value: 20, remainingActions: 3, source: 'monster' });
        addEffect(s, { type: 'speed_mod', value: 20, remainingActions: 3, source: 'monster' });
        addLog(s, `[${skill.name}] 모든 능력치 20% 상승 3행동!`);
      }
      break;
    }

    case 'gauge_freeze': {
      dealBuffSkillDamage(s, skill, useMatk);
      if (hasEffect(s, 'player', 'cc_immune')) {
        addLog(s, `[${skill.name}] 몬스터 상태이상 면역!`);
        break;
      }
      if (monsterResistsCC(s.monsterLevel)) {
        addLog(s, `[${skill.name}] 몬스터가 CC에 저항! (고레벨)`);
        break;
      }
      const freezeExt = getPassive(s, 'freeze_extend');
      const gcAmp2 = getPassive(s, 'gauge_control_amp');
      const freezeDur = Math.round((skill.effect_duration + freezeExt) * (1 + gcAmp2 / 100));
      addEffect(s, { type: 'gauge_freeze', value: 0, remainingActions: freezeDur, source: 'player' });
      addEffect(s, { type: 'cc_immune', value: 0, remainingActions: freezeDur + 3, source: 'player' });
      addLog(s, `[${skill.name}] 적 게이지 동결 ${freezeDur}행동!`);
      break;
    }

    case 'gauge_fill': {
      const fillAmt = skill.effect_value > 0 ? skill.effect_value : GAUGE_MAX;
      s.playerGauge = Math.min(GAUGE_MAX, s.playerGauge + fillAmt);
      addLog(s, `[${skill.name}] 게이지 +${fillAmt}!`);
      // 도적 기습: 다음 1행동간 치명타 확정
      if (skill.name === '기습') {
        addEffect(s, { type: 'crit_guaranteed', value: 0, remainingActions: 2, source: 'monster' });
        addLog(s, `[${skill.name}] 다음 공격 치명타 확정!`);
      }
      break;
    }

    case 'accuracy_debuff': {
      dealBuffSkillDamage(s, skill, useMatk);
      // 연막탄 전용: 적 게이지 25% 감소
      if (skill.name === '연막탄') {
        const before = s.monsterGauge;
        s.monsterGauge = Math.round(s.monsterGauge * 0.75);
        addLog(s, `[${skill.name}] 적 게이지 -${before - s.monsterGauge}`);
      }
      const ctrlAmp = getPassive(s, 'control_amp');
      const smokeExt = getPassive(s, 'smoke_extend');
      const debuffVal = Math.round(skill.effect_value * (1 + ctrlAmp / 100));
      const debuffDur = skill.effect_duration + smokeExt;
      addEffect(s, { type: 'accuracy_debuff', value: debuffVal, remainingActions: debuffDur, source: 'player' });
      addLog(s, `[${skill.name}] 적 명중률 ${debuffVal}% 감소 ${debuffDur}행동!`);
      // 독안개/맹독의 안개: 설명상 독 도트 효과 추가
      if (skill.name === '독안개' || skill.name === '맹독의 안개') {
        const dotBase = useMatk ? s.playerStats.matk : s.playerStats.atk;
        const dotDmg = Math.round(dotBase * 1.7);
        const poisonLordExt3 = getPassive(s, 'poison_lord') > 0 ? 3 : 0;
        addEffect(s, { type: 'poison', value: dotDmg, remainingActions: debuffDur + poisonLordExt3, source: 'player', dotMult: 1.7, dotUseMatk: useMatk });
        addLog(s, `[${skill.name}] 독 ${dotDmg}/행동 x${debuffDur}행동 (방어 50% 무시)`);
      }
      break;
    }

    case 'damage_reduce': {
      dealBuffSkillDamage(s, skill, useMatk);
      addEffect(s, { type: 'damage_reduce', value: skill.effect_value, remainingActions: skill.effect_duration, source: 'monster' }); // protects player
      addLog(s, `[${skill.name}] 받는 데미지 ${skill.effect_value}% 감소!`);
      break;
    }

    case 'atk_buff': {
      dealBuffSkillDamage(s, skill, useMatk);
      addEffect(s, { type: 'atk_buff', value: skill.effect_value, remainingActions: skill.effect_duration, source: 'monster' }); // self-buff
      addLog(s, `[${skill.name}] 공격력 ${skill.effect_value}% 증가 ${skill.effect_duration}행동!`);
      // 성직자 빛의 축복: 즉시 HP 50% 회복
      if (skill.name === '빛의 축복') {
        const heal = Math.round(s.playerMaxHp * 0.5);
        s.playerHp = Math.min(s.playerMaxHp, s.playerHp + heal);
        s.dirty = true;
        addLog(s, `[${skill.name}] HP +${heal} 회복`);
      }
      break;
    }

    case 'damage_reflect': {
      dealBuffSkillDamage(s, skill, useMatk);
      addEffect(s, { type: 'damage_reflect', value: skill.effect_value, remainingActions: skill.effect_duration, source: 'monster' });
      addLog(s, `[${skill.name}] 데미지 ${skill.effect_value}% 반사!`);
      break;
    }

    case 'invincible': {
      s.playerHp = Math.max(1, s.playerHp);
      addEffect(s, { type: 'invincible', value: 0, remainingActions: skill.effect_duration, source: 'monster' });
      addLog(s, `[${skill.name}] 무적 ${skill.effect_duration}행동!`);
      break;
    }

    case 'shield': {
      // 공격 + 보호막 (damage_mult > 0이면 데미지도 처리) — judge_amp 등 풀 파이프라인 적용
      dealBuffSkillDamage(s, skill, useMatk);
      let shieldHp = Math.round(s.playerMaxHp * skill.effect_value / 100);
      const shieldAmp = getPassive(s, 'shield_amp');
      if (shieldAmp > 0) shieldHp = Math.round(shieldHp * (1 + shieldAmp / 100));
      addEffect(s, { type: 'shield', value: shieldHp, remainingActions: skill.effect_duration || 3, source: 'monster' });
      addLog(s, `[${skill.name}] 실드 ${shieldHp}!`);
      break;
    }

    case 'shield_break': {
      // 심판의 철퇴 / 대심판의 철퇴 등 — 자신의 쉴드는 유지, 쉴드량의 N%를 추가 데미지로 변환
      // case 'damage'와 동일한 증폭 파이프라인 적용 (judge_amp/spell_amp/크리 추가배율 등)
      const myShieldTotal = s.statusEffects
        .filter(e => e.type === 'shield' && e.source === 'monster' && e.value > 0)
        .reduce((sum, e) => sum + e.value, 0);
      const shieldMult = skill.name === '대심판의 철퇴' ? 8.0 : 4.0;
      const shieldBonus = myShieldTotal > 0 ? Math.round(myShieldTotal * shieldMult) : 0;
      // armor_pierce 적용 (일반 damage와 동일)
      const totalDefReduce = Math.min(80, armorPierce + prefixDefReduce + prefixDefPierce);
      const defModStats = totalDefReduce > 0 ? {
        ...s.monsterStats,
        def: Math.round(s.monsterStats.def * (1 - totalDefReduce / 100)),
        mdef: Math.round(s.monsterStats.mdef * (1 - totalDefReduce / 100)),
      } : s.monsterStats;
      const d = calcDamage(s.playerStats, defModStats, skill.damage_mult, useMatk, skill.flat_damage);
      if (d.miss) {
        addLog(s, `[${skill.name}] 빗나감!`);
        s.missStack = Math.min(5, s.missStack + 1);
      } else {
        const parts: string[] = [];
        // 베이스 데미지 + 실드 보너스 + HP% 보너스 — 증폭 전에 모두 합산
        let dmg = d.damage + shieldBonus;
        if (shieldBonus > 0) parts.push(`실드 비례 +${shieldBonus}`);
        if (skill.effect_value > 0) {
          const hpBonus = Math.round(s.playerMaxHp * skill.effect_value / 100);
          dmg += hpBonus;
          parts.push(`HP ${skill.effect_value}% +${hpBonus}`);
        }
        // 디버프: damage_taken_up (적이 받는 데미지 증가)
        const dtUp = s.statusEffects.find(e => e.type === 'damage_taken_up' && e.source === 'player' && e.remainingActions > 0);
        if (dtUp) dmg = Math.round(dmg * (1 + dtUp.value / 100));
        // 버프: atk_buff (전쟁의 함성 등 — 플레이어 공격력 증가)
        const atkBuff = s.statusEffects.find(e => e.type === 'atk_buff' && e.source === 'monster' && e.remainingActions > 0);
        if (atkBuff) dmg = Math.round(dmg * (1 + atkBuff.value / 100));
        // 패시브: spell_amp (마법 증폭)
        if (spellAmp > 0) dmg = Math.round(dmg * (1 + spellAmp / 100));
        // 패시브: judge_amp / holy_judge (성직자 공격 스킬 증폭) — 심판계열 핵심
        const judgeAmp = getPassive(s, 'judge_amp') + getPassive(s, 'holy_judge');
        if (judgeAmp > 0 && s.className === 'cleric') dmg = Math.round(dmg * (1 + judgeAmp / 100));
        // 접두사: 광전사 (내 HP 30% 이하)
        const berserk = s.equipPrefixes.berserk_pct || 0;
        if (berserk > 0 && s.playerHp / s.playerMaxHp <= 0.3) {
          dmg = Math.round(dmg * (1 + berserk / 100));
        }
        // 접두사: 약점간파 (첫 공격)
        const firstStrike = s.equipPrefixes.first_strike_pct || 0;
        if (firstStrike > 0 && s.hasFirstStrike) {
          dmg = Math.round(dmg * (1 + firstStrike / 100));
          s.hasFirstStrike = false;
        }
        // 접두사: 각성 (5초 이상 미피격)
        const ambush = s.equipPrefixes.ambush_pct || 0;
        if (ambush > 0 && s.ticksSinceLastHit >= 50) {
          dmg = Math.round(dmg * (1 + ambush / 100));
          s.ticksSinceLastHit = 0;
        }
        // 크리 추가 배율: crit_damage 패시브 + 접두사 crit_dmg_pct
        if (d.crit) {
          const critDmgBonus = getCritDmgBonus(s);
          if (critDmgBonus > 0) dmg = Math.round(dmg * (1 + critDmgBonus / 100));
        }
        s.monsterHp -= dmg;
        const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';
        addLog(s, `[${skill.name}] ${dmg} 데미지${d.crit ? '!' : ''}${suffix}`);
      }
      break;
    }

    case 'holy_strike': {
      // 신성 타격 — 기본 데미지 + 방어력 비례 추가 데미지
      const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk, skill.flat_damage);
      if (!d.miss) {
        const defBonus = Math.round(s.playerStats.def * (skill.effect_value || 100) / 100);
        // 접두사 공통: 광전사/약점간파/각성/치명 데미지 (베이스 데미지 + 방어력 비례 둘 다 증폭)
        const total = applyDamagePrefixes(s, d.damage + defBonus, d.crit, { skillName: skill.name });
        s.monsterHp -= total;
        addLog(s, `[${skill.name}] ${total} 데미지${d.crit ? '!' : ''} (방어력 +${defBonus})`);
      } else {
        addLog(s, `[${skill.name}] 빗나감!`);
      }
      break;
    }

    case 'judgment_day': {
      // 심판의 날 — 실드 파괴 + 데미지 + 자신 방어력 50% 3턴 버프
      s.statusEffects = s.statusEffects.filter(e => !(e.type === 'shield'));
      const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk, skill.flat_damage);
      if (!d.miss) {
        const dmg = applyDamagePrefixes(s, d.damage, d.crit, { skillName: skill.name });
        s.monsterHp -= dmg;
        addLog(s, `[${skill.name}] 실드 파괴 + ${dmg} 데미지${d.crit ? '!' : ''}`);
      }
      const buffPct = skill.effect_value || 50;
      const buffDur = skill.effect_duration || 3;
      addEffect(s, { type: 'def_buff', value: buffPct, remainingActions: buffDur, source: 'monster' });
      addLog(s, `[${skill.name}] 방어력 +${buffPct}% ${buffDur}턴!`);
      // 성직자 천상 강림: 즉시 HP 40% 회복
      if (skill.name === '천상 강림') {
        const heal = Math.round(s.playerMaxHp * 0.4);
        s.playerHp = Math.min(s.playerMaxHp, s.playerHp + heal);
        addLog(s, `[${skill.name}] HP +${heal} 회복`);
      }
      break;
    }

    case 'heal_pct': {
      let heal = Math.round(s.playerMaxHp * skill.effect_value / 100);
      const healAmp = getPassive(s, 'heal_amp');
      if (healAmp > 0) heal = Math.round(heal * (1 + healAmp / 100));
      s.playerHp = Math.min(s.playerMaxHp, s.playerHp + heal);
      // 치유의 빛: 회복량만큼 적에게 피해 (신성 데미지)
      s.monsterHp -= heal;
      addLog(s, `[${skill.name}] HP +${heal} 회복! 적에게 ${heal} 신성 피해`);
      break;
    }

    case 'resurrect': {
      addEffect(s, { type: 'resurrect', value: skill.effect_value, remainingActions: 999, source: 'monster' });
      addLog(s, `[${skill.name}] 부활 준비!`);
      break;
    }

    // ── 소환사 전용 ──
    case 'summon':
    case 'summon_tank':
    case 'summon_dot':
    case 'summon_heal':
    case 'summon_multi': {
      // 같은 종류 소환수 캡 = 3 (per-type)
      const PER_TYPE_CAP = 3;
      const sameType = s.statusEffects.filter(e => e.type === 'summon' && e.source === 'player' && e.summonSkillName === skill.name);
      if (sameType.length >= PER_TYPE_CAP) {
        // 같은 종류 중 가장 오래된 것 교체
        const oldestSame = sameType.reduce((a, b) => a.remainingActions < b.remainingActions ? a : b);
        s.statusEffects = s.statusEffects.filter(e => e.id !== oldestSame.id);
        addLog(s, `[${skill.name}] 같은 종류 교체!`);
      }
      // 전체 소환수 캡 (글로벌) — 다른 종류 보호: 가장 많이 차지한 종류부터 우선 제거
      const maxSummons = MAX_SUMMONS + getPassive(s, 'summon_max_extra');
      const activeSummons = s.statusEffects.filter(e => e.type === 'summon' && e.source === 'player');
      if (activeSummons.length >= maxSummons) {
        // 종류별 카운트
        const typeCount = new Map<string, number>();
        for (const sm of activeSummons) {
          const k = sm.summonSkillName || '?';
          typeCount.set(k, (typeCount.get(k) || 0) + 1);
        }
        // 가장 많이 차지한 종류 (자기자신 제외 우선)
        let dominantType = '';
        let dominantCount = 0;
        for (const [k, c] of typeCount) {
          if (k === skill.name) continue; // 자기자신 종류는 후순위
          if (c > dominantCount) { dominantCount = c; dominantType = k; }
        }
        // 자기자신만 있으면 자기 종류에서 제거
        if (!dominantType) {
          for (const [k, c] of typeCount) {
            if (c > dominantCount) { dominantCount = c; dominantType = k; }
          }
        }
        // 지배 종류 중 가장 오래된 1마리 제거
        const candidates = activeSummons.filter(e => (e.summonSkillName || '?') === dominantType);
        if (candidates.length > 0) {
          const oldest = candidates.reduce((a, b) => a.remainingActions < b.remainingActions ? a : b);
          s.statusEffects = s.statusEffects.filter(e => e.id !== oldest.id);
          addLog(s, `[소환] ${skill.name} 교체 소환! (${dominantType} 정리)`);
        }
      }
      const durBonus = getPassive(s, 'summon_duration');
      const infinite = getPassive(s, 'summon_infinite') > 0;
      const dur = infinite ? 999 : skill.effect_duration + durBonus;
      const healMarker = skill.effect_type === 'summon_heal' ? -1 : 0;
      const multiHits = skill.effect_type === 'summon_multi' ? 3 : 1;
      const effectiveValue = skill.effect_type === 'summon_multi' ? skill.effect_value * multiHits : skill.effect_value;
      addEffect(s, { type: 'summon', value: effectiveValue, remainingActions: dur, source: 'player', dotMult: healMarker, element: skill.element || undefined, summonSkillName: skill.name });
      addLog(s, `[${skill.name}] 소환! (MATK x${skill.effect_value}%${multiHits > 1 ? ` x${multiHits}회` : ''}, ${infinite ? '무한' : dur + '행동'})`);
      // 소환_도트: 추가로 화상 도트도 부여
      if (skill.effect_type === 'summon_dot') {
        const dotBase = s.playerStats.matk;
        const DOT_MULT = 1.56;
        const dotDmg = Math.round(dotBase * DOT_MULT);
        addEffect(s, { type: 'dot', value: dotDmg, remainingActions: dur, source: 'player', dotMult: DOT_MULT, dotUseMatk: true });
        addLog(s, `[${skill.name}] 화상 도트 ${dotDmg}/행동`);
      }
      // 소환_탱크: 받는 데미지 감소 버프
      // — 중복 누적 방지: 기존 summon_tank 발 damage_reduce 제거 후 갱신
      // — summon_infinite 시에도 받는 데미지 감소는 effect_duration 으로 고정
      if (skill.effect_type === 'summon_tank') {
        // 기존 damage_reduce 제거 (소환수 본체와 별개로 단일 인스턴스 유지)
        s.statusEffects = s.statusEffects.filter(e => !(e.type === 'damage_reduce' && e.source === 'monster' && e.value === 20));
        const dmgReduceDur = skill.effect_duration;
        addEffect(s, { type: 'damage_reduce', value: 20, remainingActions: dmgReduceDur, source: 'monster' });
        addLog(s, `[${skill.name}] 받는 데미지 20% 감소 ${dmgReduceDur}행동 (갱신)`);
      }
      break;
    }

    case 'summon_buff': {
      // 소환수 버프 (지휘/군주의 위엄) — 중복 제거 후 단일 인스턴스 갱신
      s.statusEffects = s.statusEffects.filter(e => e.type !== 'summon_buff_active');
      addEffect(s, { type: 'summon_buff_active', value: skill.effect_value, remainingActions: skill.effect_duration, source: 'monster' });
      addLog(s, `[${skill.name}] 소환수 데미지 +${skill.effect_value}% ${skill.effect_duration}행동!`);
      break;
    }

    case 'summon_extend': {
      // 소환수 지속시간 연장
      const ext = skill.effect_value;
      for (const eff of s.statusEffects) {
        if (eff.type === 'summon' && eff.source === 'player') eff.remainingActions += ext;
      }
      addLog(s, `[${skill.name}] 소환수 전원 지속시간 +${ext}행동!`);
      break;
    }

    case 'summon_frenzy': {
      // 야수의 분노 — 소환수 2회 공격, 단일 인스턴스 갱신
      s.statusEffects = s.statusEffects.filter(e => e.type !== 'summon_frenzy_active');
      addEffect(s, { type: 'summon_frenzy_active', value: skill.effect_value, remainingActions: skill.effect_duration, source: 'monster' });
      addLog(s, `[${skill.name}] 소환수 ${skill.effect_value}회 공격 ${skill.effect_duration}행동!`);
      break;
    }

    case 'summon_all': {
      // 총공격: 본체 + 소환수 전부 동시 공격
      const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, true);
      if (!d.miss) { s.monsterHp -= d.damage; addLog(s, `[${skill.name}] 본체 ${d.damage}${d.crit ? '!' : ''}`); }
      processSummons(s);
      break;
    }

    case 'summon_sacrifice': {
      // 희생: 가장 강한 소환수 파괴 → 폭발 데미지
      const summons = s.statusEffects.filter(e => e.type === 'summon' && e.source === 'player');
      if (summons.length === 0) { addLog(s, `[${skill.name}] 소환수가 없습니다!`); break; }
      const strongest = summons.reduce((a, b) => a.value > b.value ? a : b);
      s.statusEffects = s.statusEffects.filter(e => e.id !== strongest.id);
      const sacDmg = Math.round(s.playerStats.matk * strongest.value / 100 * skill.damage_mult);
      s.monsterHp -= sacDmg;
      addLog(s, `[${skill.name}] 소환수 희생! ${sacDmg.toLocaleString()} 폭발 데미지`);
      break;
    }

    case 'summon_storm': {
      // 영혼 폭풍: 소환수 수 × MATK × mult
      const cnt = s.statusEffects.filter(e => e.type === 'summon' && e.source === 'player').length;
      if (cnt === 0) { addLog(s, `[${skill.name}] 소환수가 없습니다!`); break; }
      const stormDmg = Math.round(s.playerStats.matk * skill.damage_mult * cnt);
      s.monsterHp -= stormDmg;
      addLog(s, `[${skill.name}] ${cnt}마리 × MATK x${Math.round(skill.damage_mult * 100)}% = ${stormDmg.toLocaleString()}`);
      break;
    }

    default:
      addLog(s, `[${skill.name}] 사용!`);
  }

  // ── 마법사 마나의 흐름 패시브 ──
  // 스킬 사용 시 스택 1 증가, 5스택 도달 시 5행동간 쿨다운 무시 버스트.
  // 버스트 중 사용한 스킬은 스택에 포함되지 않고, 각 사용마다 남은 행동 1 감소.
  if (s.className === 'mage') {
    if (s.manaFlowActive > 0) {
      s.manaFlowActive--;
      if (s.manaFlowActive === 0) {
        addLog(s, `[마나의 흐름] 효과 종료`);
      }
    } else {
      s.manaFlowStacks++;
      if (s.manaFlowStacks >= 5) {
        s.manaFlowStacks = 0;
        s.manaFlowActive = 5;
        addLog(s, `✨ [마나의 흐름] 5행동간 스킬 쿨다운 무시!`);
      }
    }
  }
}

// ── 자동 행동 AI ──

// 쿨다운이 끝난 사용 가능한 스킬인지 체크
function isSkillReady(s: ActiveSession, sk: SkillDef): boolean {
  if (sk.cooldown_actions === 0) return true;
  // 마법사 마나의 흐름 버스트: 모든 스킬 쿨다운 무시
  if (s.className === 'mage' && s.manaFlowActive > 0) return true;
  const cd = s.skillCooldowns.get(sk.id);
  return !cd || cd <= 0;
}

// 특정 effect_type 중 사용 가능한 첫 번째 스킬 반환
function findReady(s: ActiveSession, ...types: string[]): SkillDef | undefined {
  return s.skills.find(sk => types.includes(sk.effect_type) && isSkillReady(s, sk));
}

// 특정 이펙트가 이미 걸려있는지
function hasActivePlayerBuff(s: ActiveSession, type: string): boolean {
  return s.statusEffects.some(e => e.type === type && e.remainingActions > 0 &&
    (e.source === 'monster' /* player self-buffs stored as monster source */));
}

// 슬롯 스킬이 지금 사용해서 효과를 볼 만한 상태인지 (낭비 방지)
function isSkillContextuallyUsable(s: ActiveSession, sk: SkillDef, hpPct: number, poisonCount: number): boolean {
  switch (sk.effect_type) {
    case 'heal_pct':
      return hpPct < 1.0; // 풀HP면 낭비
    case 'shield':
      // 실드 스킬은 모두 중첩 — 쿨다운만 보고 항상 시전 허용.
      return true;
    case 'damage_reduce':
      return sk.damage_mult > 0 || !hasActivePlayerBuff(s, 'damage_reduce');
    case 'atk_buff':
      return sk.damage_mult > 0 || !hasActivePlayerBuff(s, 'atk_buff');
    case 'damage_reflect':
      return sk.damage_mult > 0 || !hasActivePlayerBuff(s, 'damage_reflect');
    case 'invincible':
      return !hasActivePlayerBuff(s, 'invincible');
    case 'resurrect':
      return !hasActivePlayerBuff(s, 'resurrect');
    case 'gauge_freeze':
      return sk.damage_mult > 0 || !hasEffect(s, 'player', 'gauge_freeze');
    case 'accuracy_debuff':
      return sk.damage_mult > 0 || !hasEffect(s, 'player', 'accuracy_debuff');
    case 'poison_burst':
      return poisonCount > 0; // 독 없으면 낭비
    case 'summon_storm':
    case 'summon_all':
    case 'summon_sacrifice': {
      // 활성 소환수가 없으면 낭비 — 스킵
      const hasSummon = s.statusEffects.some(e => e.type === 'summon' && e.source === 'player' && e.remainingActions > 0);
      return hasSummon;
    }
    case 'self_speed_mod': {
      // 자해 페널티(음수)는 항상 사용 가능
      if (sk.effect_value <= 0) return true;
      // 양수 자가 버프 — 이미 같은 부호(+)의 자가 버프가 있을 때만 차단
      // (과부하 -50 같은 음수 디버프가 걸려 있어도 집중은 사용 가능)
      const hasPositiveSelfSpd = s.statusEffects.some(e =>
        e.type === 'speed_mod' && e.source === 'monster' && e.value > 0 && e.remainingActions > 0);
      return !hasPositiveSelfSpd;
    }
    default:
      return true; // damage / dot / poison / stun / etc — 항상 사용 가능
  }
}

async function autoAction(s: ActiveSession): Promise<void> {
  const hpPct = s.playerHp / s.playerMaxHp;

  // ── 자동 포션 (아이템 — 스킬과 별개, HP 위험 시 사용) ──
  const healThresholdPct = s.autoPotionThreshold || 50;
  if (hpPct * 100 < healThresholdPct && s.autoPotionEnabled && s.potionCooldown <= 0) {
    const potionHealPct: Record<number, number> = { 106: 80, 104: 60, 102: 40, 100: 20 };
    const pot = await getPotionInInventory(s.characterId, [106, 104, 102, 100]);
    if (pot) {
      const pct = potionHealPct[pot.item_id] || 20;
      const heal = Math.round(s.playerMaxHp * pct / 100);
      s.playerHp = Math.min(s.playerMaxHp, s.playerHp + heal);
      await consumeOneFromSlot(pot.id);
      s.potionCooldown = 3;
      s.metaDirty = true;
      addLog(s, `체력 물약 사용 — HP +${heal} (${pct}%) [쿨타임 3턴]`);
      return;
    }
  }

  // ── 슬롯 순서대로 행동 ──
  // 1단계: kind='buff' 스킬은 "자유 행동" — 가능한 모두 즉시 발동, 턴 소모 없음.
  //         (쿨다운은 정상 적용 → 사이클 보존)
  // 2단계: 비-buff 스킬 중 첫 번째 사용 가능한 것 1개 → 메인 행동
  const poisonCount = s.statusEffects.filter(e => e.type === 'poison' && e.source === 'player').length;
  const sorted = [...s.skills].sort((a, b) => a.slot_order - b.slot_order);

  // 실드 스킬은 모두 중첩 — 우선순위 없이 준비된 것 전부 발동
  for (const sk of sorted) {
    if (sk.kind !== 'buff') continue;
    if (!isSkillReady(s, sk)) continue;
    if (!isSkillContextuallyUsable(s, sk, hpPct, poisonCount)) continue;
    await executeSkill(s, sk);
  }

  for (const sk of sorted) {
    if (sk.kind === 'buff') continue;
    if (!isSkillReady(s, sk)) continue;
    if (!isSkillContextuallyUsable(s, sk, hpPct, poisonCount)) continue;
    await executeSkill(s, sk);
    // 시간 지배자 (마법사): skill_double_chance % 확률로 스킬 1회 추가 발동
    const dblChance = getPassive(s, 'skill_double_chance');
    if (dblChance > 0 && Math.random() * 100 < dblChance) {
      addLog(s, `⏳ [시간 지배자] 스킬 재발동!`);
      await executeSkill(s, sk);
    }
    // 소환사: 메인 스킬 후 소환수 자동 공격
    if (s.className === 'summoner') processSummons(s);
    return;
  }

  // fallback: 모든 스킬이 쿨 또는 사용 불가일 때 기본 공격
  // 기본공격 턴에도 독의 공명 폭발 체크 (스킬 미사용 시 게이지가 멈추는 문제 방지)
  tryPoisonResonanceBurst(s);
  const d = calcDamage(s.playerStats, s.monsterStats, 1.0, MATK_CLASSES.has(s.className));
  if (d.miss) {
    addLog(s, '기본 공격 빗나감!');
    s.missStack = Math.min(5, s.missStack + 1);
  } else {
    s.monsterHp -= d.damage;
    addLog(s, `${d.damage} 데미지${d.crit ? ' (치명타!)' : ''}`);
  }
}

// ── 몬스터 행동 ──
// tickDownEffects(s, 'player')는 monsterAction 외부(메인 루프)에서 처리.
// 도트가 먼저 적용된 뒤 카운트가 감소하도록 순서 조정 — 마지막 1틱이 사라지지 않게.
function monsterAction(s: ActiveSession): void {
  // 스턴 체크
  if (hasEffect(s, 'player', 'stun')) {
    addLog(s, '몬스터가 기절 상태!');
    return;
  }

  // 게이지 동결 체크
  if (hasEffect(s, 'player', 'gauge_freeze')) {
    addLog(s, '몬스터가 동결 상태!');
    return;
  }

  // 패시브: guard_instinct (HP 40% 이하 시 방어 증가)
  let playerDefStats = s.playerStats;
  const guardInstinct = getPassive(s, 'guard_instinct');
  if (guardInstinct > 0 && s.playerHp / s.playerMaxHp < 0.4) {
    playerDefStats = { ...s.playerStats, def: Math.round(s.playerStats.def * (1 + guardInstinct / 100)) };
  }
  // 스킬 def_buff (심판의 날 등)
  const defBuff = s.statusEffects.find(e => e.type === 'def_buff' && e.source === 'monster' && e.remainingActions > 0);
  if (defBuff) {
    playerDefStats = {
      ...playerDefStats,
      def: Math.round(playerDefStats.def * (1 + defBuff.value / 100)),
      mdef: Math.round(playerDefStats.mdef * (1 + defBuff.value / 100)),
    };
  }

  // 길드 보스 특수 공격 패턴 — 무작위로 광폭 / 강타 / 일반 선택
  let bossPattern: 'fury' | 'heavy' | 'normal' = 'normal';
  let skillMultForAttack = 1.0;
  let bossAttackName: string | null = null;
  let enrageMult = 1;
  if (s.guildBossRunId) {
    // 광분 타이머: 1분 경과마다 데미지 ×2 (누적)
    if (s.guildBossStartedAt > 0) {
      const elapsedMin = Math.floor((Date.now() - s.guildBossStartedAt) / 60000);
      if (elapsedMin > 0) {
        enrageMult = Math.pow(2, elapsedMin);
        skillMultForAttack *= enrageMult;
      }
    }
    const roll = Math.random();
    if (roll < 0.08) {
      bossPattern = 'fury';   // 8% 확률 — 광폭 (×4)
      skillMultForAttack *= 4.0;
      bossAttackName = '광폭 일격';
    } else if (roll < 0.28) {
      bossPattern = 'heavy';  // 20% 확률 — 강타 (×2)
      skillMultForAttack *= 2.0;
      bossAttackName = '강타';
    }
  }

  const d = calcDamage(s.monsterStats, playerDefStats, skillMultForAttack, false);

  // 명중률 디버프
  const accDebuff = s.statusEffects.find(e => e.type === 'accuracy_debuff' && e.source === 'player');
  if (accDebuff && Math.random() * 100 < accDebuff.value) {
    addLog(s, '몬스터 공격 빗나감! (연막)');
    return;
  }

  if (d.miss) {
    addLog(s, bossAttackName ? `[${s.monsterName}] ${bossAttackName} 빗나감!` : '몬스터 공격 빗나감!');
    s.dodgeBurstPending = true;
  } else {
    let dmg = d.damage;
    if (bossPattern !== 'normal' && bossAttackName) {
      addLog(s, `[${s.monsterName}] ${bossAttackName}!${enrageMult > 1 ? ` 광분×${enrageMult}` : ''} (×${skillMultForAttack.toFixed(1)})`);
    } else if (enrageMult > 1) {
      addLog(s, `[${s.monsterName}] 광분×${enrageMult}`);
    }

    // 무적 체크
    if (hasEffect(s, 'monster', 'invincible')) {
      addLog(s, `무적! 데미지 무효화`);
      return;
    }

    // 실드 체크 — 여러 실드가 중첩된 경우 순차 흡수
    const shields = s.statusEffects.filter(e => e.type === 'shield' && e.source === 'monster' && e.value > 0);
    if (shields.length > 0 && dmg > 0) {
      let absorbed = 0;
      for (const shield of shields) {
        if (dmg <= 0) break;
        if (shield.value >= dmg) {
          shield.value -= dmg;
          absorbed += dmg;
          dmg = 0;
        } else {
          absorbed += shield.value;
          dmg -= shield.value;
          shield.value = 0;
          shield.remainingActions = 0;
        }
      }
      const remainTotal = shields.reduce((sum, e) => sum + Math.max(0, e.value), 0);
      if (dmg <= 0) {
        addLog(s, `실드가 ${absorbed} 흡수 (잔여: ${remainTotal})`);
      } else {
        addLog(s, `실드 ${absorbed} 흡수 후 파괴! 잔여 ${dmg} 데미지`);
      }
    }

    // 데미지 감소
    const reduce = s.statusEffects.find(e => e.type === 'damage_reduce' && e.source === 'monster');
    if (reduce && dmg > 0) {
      dmg = Math.round(dmg * (1 - reduce.value / 100));
    }

    // 접두사: 수호자 (HP 50% 이상)
    const guardian = s.equipPrefixes.guardian_pct || 0;
    let guardianProc = false;
    if (guardian > 0 && dmg > 0 && s.playerHp / s.playerMaxHp >= 0.5) {
      dmg = Math.round(dmg * (1 - guardian / 100));
      guardianProc = true;
    }
    // 접두사: 받는 데미지 감소 (상시)
    const dtDown = s.equipPrefixes.damage_taken_down_pct || 0;
    if (dtDown > 0 && dmg > 0) {
      dmg = Math.round(dmg * (1 - dtDown / 100));
    }
    if (guardianProc) addLog(s, `[수호자] 받는 데미지 -${guardian}%`);

    // 접두사: 경감 (damage_taken_down_pct) — 조건 없이 상시 감소
    const dmgTakenDown = s.equipPrefixes.damage_taken_down_pct || 0;
    if (dmgTakenDown > 0 && dmg > 0) {
      dmg = Math.round(dmg * (1 - dmgTakenDown / 100));
    }

    if (dmg > 0) {
      s.playerHp -= dmg;
      const defUsed = Math.round(playerDefStats.def);
      addLog(s, `몬스터가 ${dmg} 데미지${d.crit ? '!' : ''} (방어 ${defUsed})`);
      // 피격 → 각성 카운터 리셋
      s.ticksSinceLastHit = 0;
    }

    // 접두사: 가시 반사 (thorns_pct)
    const thorns = s.equipPrefixes.thorns_pct || 0;
    if (thorns > 0 && d.damage > 0) {
      const thornDmg = Math.round(d.damage * thorns / 100);
      s.monsterHp -= thornDmg;
      addLog(s, `가시 반사! ${thornDmg} 데미지`);
    }

    // 반사 (패시브: reflect_amp)
    const reflect = s.statusEffects.find(e => e.type === 'damage_reflect' && e.source === 'monster');
    if (reflect && d.damage > 0) {
      let reflectPct = reflect.value;
      const reflectAmp = getPassive(s, 'reflect_amp');
      if (reflectAmp > 0) reflectPct = Math.round(reflectPct * (1 + reflectAmp / 100));
      const reflected = Math.round(d.damage * reflectPct / 100);
      s.monsterHp -= reflected;
      addLog(s, `반사! 몬스터에게 ${reflected} 데미지`);
    }
  }
}

// ── 몬스터 처치 ──
async function handleMonsterDeath(s: ActiveSession): Promise<void> {
  // 길드 보스: 절대 죽지 않음 — HP 복구 후 종료
  if (s.guildBossRunId) {
    s.monsterHp = s.monsterMaxHp;
    s.dirty = true;
    return;
  }

  // 스폰 시 캐시된 몬스터 정의 재사용 (킬당 DB 1 쿼리 절감)
  const m = s.monsterDef;
  if (!m) return;

  // 마법사 전용: 오버킬의 50%를 다음 스폰 몬스터에게 캐리 (실사냥 1타킬 보상)
  if (s.className === 'mage') {
    const overkill = Math.max(0, -s.monsterHp);
    if (overkill > 0) {
      s.mageOverkillCarry = Math.round(overkill * 0.5);
    }
  }

  // 도적 전용: 사망 직전 부여돼 있던 player-source 독 스택을 다음 몬스터로 전이 (cap 20)
  if (s.className === 'rogue') {
    const carry = s.statusEffects
      .filter(e => e.type === 'poison' && e.source === 'player' && e.remainingActions > 0)
      .slice(0, 20)
      .map(e => ({
        value: e.value,
        remainingActions: e.remainingActions,
        dotMult: e.dotMult ?? 1.0,
        dotUseMatk: e.dotUseMatk ?? false,
      }));
    s.rogueDotCarry = carry;
  }

  // 처치 시간 기록 (최근 10킬 유지) — 오프라인 보상 계산용 DB 저장도 함께
  if (s.monsterSpawnAt > 0) {
    const elapsedSec = (Date.now() - s.monsterSpawnAt) / 1000;
    if (elapsedSec > 0 && elapsedSec < 600) {
      s.recentKillTimes.push(Math.round(elapsedSec * 100) / 100);
      if (s.recentKillTimes.length > 10) s.recentKillTimes.shift();
      // 10킬 쌓일 때마다 평균을 DB에 저장 (오프라인 보상 시 사용)
      if (s.recentKillTimes.length >= 5 && s.recentKillTimes.length % 5 === 0) {
        const avg = s.recentKillTimes.reduce((a, b) => a + b, 0) / s.recentKillTimes.length;
        query('UPDATE characters SET recent_avg_kill_time_sec = $1 WHERE id = $2', [avg.toFixed(3), s.characterId])
          .catch(e => console.error('[kill-time-save]', e));
      }
    }
  }

  // lethal_tempo: 킬 시 모든 스킬 쿨다운 감소
  const lethalTempo = getPassive(s, 'lethal_tempo');
  if (lethalTempo > 0) {
    for (const [skId, cd] of s.skillCooldowns) {
      s.skillCooldowns.set(skId, Math.max(0, cd - lethalTempo));
    }
  }
  // combo_kill_bonus: 연속킬 카운터 (최대 5)
  if (getPassive(s, 'combo_kill_bonus') > 0) {
    s.comboKills = Math.min(5, s.comboKills + 1);
  }

  // 접두사: 포식 (처치 시 HP 회복)
  const predator = s.equipPrefixes.predator_pct || 0;
  if (predator > 0) {
    const heal = Math.round(s.playerMaxHp * predator / 100);
    if (heal > 0) {
      const before = s.playerHp;
      s.playerHp = Math.min(s.playerMaxHp, s.playerHp + heal);
      const actual = s.playerHp - before;
      addLog(s, `[포식] HP +${actual} 회복`);
    }
  }

  // 접두사 + 프리미엄 부스터 + 레벨 (1 쿼리로 통합)
  const charBoost = await query<{
    gold_boost_until: string | null; drop_boost_until: string | null;
    exp_boost_until: string | null; level: number;
  }>(
    'SELECT gold_boost_until, drop_boost_until, exp_boost_until, level FROM characters WHERE id = $1',
    [s.characterId]
  );
  const charBoostRow = charBoost.rows[0];
  const goldBonusPct = s.equipPrefixes.gold_bonus_pct || 0;
  const expBonusPct = s.equipPrefixes.exp_bonus_pct || 0;
  const goldBoostActive = charBoostRow?.gold_boost_until && new Date(charBoostRow.gold_boost_until) > new Date();
  const dropBoostActive = charBoostRow?.drop_boost_until && new Date(charBoostRow.drop_boost_until) > new Date();
  const isExpBoosted = charBoostRow?.exp_boost_until && new Date(charBoostRow.exp_boost_until) > new Date();
  // 길드 스킬 버프: 세션 캐시 재사용 (refreshSessionMeta가 이미 GUILD_SKILL_PCT 곱한 값을 저장)
  const guildGoldBonus = s.cachedGuildBuffs.gold;
  const guildExpBonus = s.cachedGuildBuffs.exp;
  const guildDropBonus = s.cachedGuildBuffs.drop;
  // 영토 점령 보너스 (점령 길드원 한정)
  // 영토 점령전 일시 비활성 — 보너스 0
  const territoryBonus = { expPct: 0, dropPct: 0 };
  // const territoryBonus = await getTerritoryBonusForChar(s.characterId, s.fieldId);
  // 글로벌 이벤트 배율 (서버 전체 공용)
  const ge = await getActiveGlobalEvent();
  // console.log 제거 — 매 킬마다 JSON 출력은 성능 저하 원인
  // 몬스터 골드 드롭 전역 -50% (인플레·자금세탁 억제)
  const MONSTER_GOLD_MULT = 0.5;
  const finalGold = Math.floor(m.gold_reward * MONSTER_GOLD_MULT * (1 + goldBonusPct / 100) * (1 + guildGoldBonus / 100) * (goldBoostActive ? 1.5 : 1.0) * ge.gold);
  const levelDiffMult = computeLevelDiffExpMult(charBoostRow?.level ?? 1, m.level);
  const previewExp = Math.floor(m.exp_reward * (isExpBoosted ? 1.5 : 1.0) * (1 + expBonusPct / 100) * (1 + guildExpBonus / 100) * ge.exp * levelDiffMult);

  if (ge.active) {
    addLog(s, `🎉 [${ge.name}] EXP×${ge.exp} 골드×${ge.gold} 드랍×${ge.drop} 적용`);
  }
  if (levelDiffMult < 1.0) {
    addLog(s, `⚠️ 레벨차 -${charBoostRow!.level - m.level} → EXP ${Math.round(levelDiffMult * 100)}%`);
  }
  // 부스트/접두사 보너스 표시 — 기본값 대비 추가분
  const baseExpRaw = Math.floor(m.exp_reward * ge.exp * levelDiffMult);
  const baseGoldRaw = Math.floor(m.gold_reward * MONSTER_GOLD_MULT * ge.gold);
  const expExtra = previewExp - baseExpRaw;
  const goldExtra = finalGold - baseGoldRaw;
  const expSuffix = expExtra > 0 ? ` (기본 ${baseExpRaw} +${expExtra})` : '';
  const goldSuffix = goldExtra > 0 ? ` (기본 ${baseGoldRaw} +${goldExtra})` : '';
  addLog(s, `${m.name}을(를) 처치! +${previewExp}exp${expSuffix}, +${finalGold}G${goldSuffix}`);

  // 일일퀘 + 업적 트래킹 — fire-and-forget (전투 루프 논블로킹)
  batchAdd(s.characterId, { killDelta: 1, goldEarnedDelta: finalGold });
  trackDailyQuestProgress(s.characterId, 'kill_monsters', 1)
    .catch(err => console.error('[combat] trackDailyQuestProgress err', err));
  checkAndUnlockAchievements(s.characterId)
    .catch(err => console.error('[combat] checkAndUnlockAchievements err', err));

  // AFK 누적: 킬 + 골드 + 경험치
  if (s.afkMode) {
    s.afkKills += 1;
    s.afkGoldGained += finalGold;
    s.afkExpGained += previewExp;
  }

  const char = await loadCharacter(s.characterId);
  if (!char) return;

  // 부스터 + 접두사 + 길드 + 영토 경험 보너스 + 글로벌 이벤트 + 레벨차 페널티
  const boostActive = char.exp_boost_until && new Date(char.exp_boost_until) > new Date();
  const boostedExp = Math.floor(m.exp_reward * (boostActive ? 1.5 : 1.0) * (1 + expBonusPct / 100) * (1 + guildExpBonus / 100) * (1 + territoryBonus.expPct / 100) * ge.exp * levelDiffMult);
  const result = applyExpGain(char.level, char.exp, boostedExp, char.class_name);
  // 길드 EXP 5% 기여 (비동기 fire-and-forget)
  contributeGuildExp(s.characterId, boostedExp).catch(() => {});
  // 영토 점수 +1 (사냥 처치 횟수 누적)
  // 영토 점령전 일시 비활성 — 점수 적립 중단
  // addTerritoryScore(s.characterId, s.fieldId).catch(() => {});

  if (result.levelsGained > 0) {
    addLog(s, `레벨업! Lv.${result.newLevel} (스탯포인트 +${result.statPointsGained})`);
    // 레벨업은 exp를 절대값으로 덮어쓰므로 pending batch를 먼저 flush
    await flushCharBatch(s.characterId);
    await query(
      `UPDATE characters SET level=$1, exp=$2, gold=gold+$3::int,
              max_hp=max_hp+$4, hp=max_hp+$4,
              node_points=node_points+$5,
              stat_points=COALESCE(stat_points,0)+$7
       WHERE id=$6`,
      [result.newLevel, result.newExp, finalGold,
       result.hpGained, result.nodePointsGained, s.characterId,
       result.statPointsGained]
    );
    // 스탯 반영된 캐릭터 다시 로드 (장비/노드 HP 보너스 포함)
    const updatedChar = await loadCharacter(s.characterId);
    const newEff = await getEffectiveStats(updatedChar || { ...char, level: result.newLevel, max_hp: char.max_hp + result.hpGained } as any);
    // 2차 버프 적용 (접두사·노드 패시브) — 누락 시 소환사·마법사 데미지 20~40% 감소 버그
    applyCombatStatBoost(newEff, s.passives, s.equipPrefixes, updatedChar?.max_hp ?? (char.max_hp + result.hpGained));
    s.playerStats = newEff;
    s.playerMaxHp = newEff.maxHp;
    s.playerHp = s.playerMaxHp; // 레벨업 시 풀회복
    s.playerSpeed = newEff.spd;
    // 활성 도트 데미지 재계산 (레벨업으로 MATK 변한 것 반영)
    for (const effItem of s.statusEffects) {
      if ((effItem.type === 'dot' || effItem.type === 'poison') && effItem.source === 'player' && effItem.dotMult !== undefined) {
        const base = effItem.dotUseMatk ? newEff.matk : newEff.atk;
        effItem.value = Math.round(base * effItem.dotMult);
      }
    }
    // 새 스킬 학습
    s.skills = await getCharSkills(s.characterId, char.class_name, result.newLevel);
  } else {
    // 레벨업 없음 → 배치 누적 (exp/gold 델타)
    batchAdd(s.characterId, { expDelta: result.newExp - char.exp, goldDelta: finalGold });
    s.cachedExp = result.newExp;
  }

  trackMonsterKill(s.characterId, s.monsterId!)
    .catch(err => console.error('[combat] trackMonsterKill err', err));

  const prefixDropBonus = s.equipPrefixes.drop_rate_pct || 0;
  let drops = rollDrops(m, !!dropBoostActive, guildDropBonus + territoryBonus.dropPct + prefixDropBonus, ge.drop);
  // 자동판매 + 드랍필터 설정 — 세션 캐시 (설정 변경 시 invalidateAutoSellCache 로 무효화)
  if (!s.autoSellCache) {
    await loadAutoSellCache(s);
  }
  const ac = s.autoSellCache!;
  const sellTiers = ac.auto_dismantle_tiers;
  const sellQualityMax = ac.auto_sell_quality_max;
  const sellProtect = new Set(ac.auto_sell_protect_prefixes);
  const dfTiers = ac.drop_filter_tiers;
  const dfQualityMax = ac.drop_filter_quality_max;
  const dfCommon = ac.drop_filter_common;
  const dfProtect = new Set(ac.drop_filter_protect_prefixes);
  const hasDropFilter = dfTiers > 0 || dfCommon;

  // 드랍 처리: 같은 드랍에 대해 접두사·품질을 한 번만 굴려서 필터/자동판매/인벤토리 저장에 공유
  const needPrefixModule = drops.length > 0 && (hasDropFilter || sellTiers > 0);
  const generatePrefixes = needPrefixModule ? (await import('../game/prefix.js')).generatePrefixes : null;

  for (const drop of drops) {
    // 1) 아이템 정보 — 메모리 캐시 (items 마스터 테이블은 런타임 변경 없음)
    const item = await getItemDef(drop.itemId);

    let preroll: EquipPreroll | undefined;
    // 장비 + 비유니크일 때만 prerolling (유니크는 addItemToInventory에서 처리)
    if (item && item.slot && item.grade !== 'unique' && generatePrefixes) {
      const { prefixIds, bonusStats, maxTier } = await generatePrefixes(item.required_level);
      const quality = Math.floor(Math.random() * 101);
      preroll = { prefixIds, bonusStats, maxTier, quality };

      const is3Options = prefixIds.length >= 3;
      const tierBit = maxTier >= 1 && maxTier <= 4 ? (1 << (maxTier - 1)) : 0;

      // 보호 접두사 검사 — 메모리 캐시 (item_prefixes 마스터 테이블 변경 없음)
      let protectStats: Set<string> | null = null;
      const needProtectLookup = prefixIds.length > 0 && (sellProtect.size > 0 || dfProtect.size > 0);
      if (needProtectLookup) {
        const keys = await getPrefixStatKeys(prefixIds);
        protectStats = new Set(keys);
      }
      const sellHasProtected = protectStats && sellProtect.size > 0
        ? [...protectStats].some(st => sellProtect.has(st)) : false;
      const dfHasProtected = protectStats && dfProtect.size > 0
        ? [...protectStats].some(st => dfProtect.has(st)) : false;

      // 2) 드랍필터: 유니크/전설 제외, common 토글 + 티어/품질 일치 시 줍지 않음
      if (hasDropFilter && item.grade !== 'legendary') {
        if (dfCommon && item.grade === 'common') {
          continue;
        }
        if (dfTiers > 0) {
          const dfTierMatch = (dfTiers & tierBit) !== 0;
          const dfQualMatch = dfQualityMax > 0 ? quality <= dfQualityMax : true;
          if (!is3Options && !dfHasProtected && dfTierMatch && dfQualMatch) {
            continue;
          }
        }
      }

      // 3) 자동판매: 티어·품질 일치 시 골드 변환 (3옵/보호 접두사 보호)
      if (sellTiers > 0) {
        const tierMatch = (sellTiers & tierBit) !== 0;
        const qualityMatch = sellQualityMax > 0 ? quality <= sellQualityMax : true;
        const shouldSell = !is3Options && !sellHasProtected && tierMatch && qualityMatch;
        if (shouldSell) {
          // 자동판매 골드 지급 중단 — 아이템만 자동 소멸
          addLog(s, `${item.name} 자동폐기 (T${maxTier}, ${quality}%)`);
          continue;
        }
        if (is3Options && tierMatch) {
          addLog(s, `${item.name} 자동판매 보호! (3옵)`);
        }
      }
    }

    // 4) 인벤토리 저장 (preroll 그대로 전달 → 필터/판매에서 본 값과 동일하게 저장)
    const { overflow, equipMetas } = await addItemToInventory(s.characterId, drop.itemId, drop.qty, undefined, preroll);
    if (overflow > 0) {
      addLog(s, '가방이 가득 차서 아이템을 버렸습니다.');
    } else {
      addLog(s, '아이템 획득!');
    }
    // AFK 카운터: 드랍된 장비별 특수 메타 누적
    if (s.afkMode && equipMetas) {
      for (const meta of equipMetas) {
        if (meta.isUnique) s.afkUnique++;
        if (meta.quality100) s.afkQuality100++;
        if (meta.isT4) s.afkT4Prefix++;
      }
    }
  }

  // exp/골드/드롭으로 인벤토리·경험치 변동 → 메타 캐시 무효화
  s.metaDirty = true;

  // 다음 몬스터 스폰
  await spawnMonsterForSession(s);
}

// 허수아비 존: 이름으로 판단 ("허수아비"로 시작하는 몬스터는 불사 + 누적 데미지 추적)
function isDummyMonster(s: ActiveSession): boolean {
  return !!s.monsterName && s.monsterName.startsWith('허수아비');
}

// 길드 보스 데미지 flush — 버퍼를 DB에 반영하고 메커닉 적용
async function flushGuildBossDamage(s: ActiveSession): Promise<void> {
  if (!s.guildBossRunId) return;
  if (s.guildBossDmgBuffer <= 0 && s.guildBossHitsBuffer <= 0) return;
  const dmg = s.guildBossDmgBuffer;
  const hits = s.guildBossHitsBuffer;
  s.guildBossDmgBuffer = 0;
  s.guildBossHitsBuffer = 0;
  try {
    // Phase 4b MVP: 메커닉의 damageType/element/isDot 메타는 알 수 없어 physical/no-element/non-dot로 가정.
    // 공통 메커닉 (약점시간대 / 누적디버프 / HP회복)은 정상 작동. 특정 보스 원소·도트·페이즈 면역은 추후 개선.
    const r = await applyDamageToRun(s.guildBossRunId, dmg, hits, { damageType: 'physical', element: null, isDot: false });
    if (r.applied.length > 0) {
      addLog(s, `[보스] ${r.applied.join(' · ')} → ${r.effective}`);
    }
  } catch (e) {
    console.error('[guild-boss] flush fail', e);
  }
}

// 행동 전후 HP 델타를 누적 + HP가 0 이하면 즉시 풀피 복원 (절대 죽지 않음)
function handleDummyTick(s: ActiveSession, hpBefore: number): void {
  if (!isDummyMonster(s)) return;
  const delta = Math.max(0, hpBefore - s.monsterHp);
  if (delta > 0) {
    if (s.dummyTrackStart === 0) s.dummyTrackStart = Date.now();
    s.dummyDamageTotal += delta;
  }
  if (s.monsterHp < s.monsterMaxHp) s.monsterHp = s.monsterMaxHp;
}

async function spawnMonsterForSession(s: ActiveSession): Promise<void> {
  // 길드 보스 세션은 보스를 "가상 몬스터"로 스폰 (필드 풀 무시)
  if (s.guildBossRunId && s.guildBossBoss) {
    const boss = s.guildBossBoss;
    const BOSS_HP_VIRTUAL = 10_000_000_000; // 사실상 무한 (99억, 도달 거의 불가능)
    s.monsterId = -1 * boss.id; // 음수로 표기해 실 몬스터와 구분
    s.monsterName = boss.name;
    s.monsterLevel = 100;
    s.monsterHp = BOSS_HP_VIRTUAL;
    s.monsterMaxHp = BOSS_HP_VIRTUAL;
    s.monsterStats = {
      str: 100, dex: 100, int: 100, vit: 100,
      spd: 300, cri: 15,
      maxHp: BOSS_HP_VIRTUAL,
      atk: boss.base_atk, matk: boss.base_atk,
      def: boss.base_def, mdef: boss.base_mdef,
      dodge: boss.base_dodge, accuracy: 120,
    };
    s.monsterSpeed = 300; // 길드 보스는 일반보다 빠르게 (공격 빈도↑)
    s.monsterGauge = 0;
    s.hasFirstStrike = true;
    s.hasFirstSkill = true;
    s.monsterSpawnAt = Date.now();
    // 플레이어 걸린 효과만 정리 (몬스터 디버프는 운영상 무관)
    s.statusEffects = s.statusEffects.filter(e =>
      e.source === 'monster' || e.type === 'summon' || e.type === 'summon_buff_active' || e.type === 'summon_frenzy_active'
    );
    addLog(s, `${boss.name}이(가) 나타났다!`);
    return;
  }

  const m = await pickRandomMonster(s.fieldId);
  if (!m) {
    s.monsterId = null;
    s.monsterDef = null;
    return;
  }
  s.monsterId = m.id;
  s.monsterDef = m; // handleMonsterDeath 에서 재사용 (중복 쿼리 제거)
  s.monsterName = m.name;
  s.monsterLevel = m.level;
  s.monsterHp = m.max_hp;
  s.monsterMaxHp = m.max_hp;
  s.monsterStats = monsterToEffective(m);
  s.monsterSpeed = s.monsterStats.spd;
  s.monsterGauge = 0;
  s.hasFirstStrike = true; // 새 몬스터 → 첫 공격 보너스 다시
  s.hasFirstSkill = true; // 새 몬스터 → shadow_strike 다시
  s.monsterSpawnAt = Date.now(); // 처치 시간 측정 시작
  // 몬스터 관련 디버프 초기화 — 소환수와 소환수 버프는 유지
  s.statusEffects = s.statusEffects.filter(e =>
    e.source === 'monster' ||
    e.type === 'summon' ||
    e.type === 'summon_buff_active' ||
    e.type === 'summon_frenzy_active'
  );
  // 마법사 오버킬 캐리: 전 처치 시 발생한 초과 데미지의 50% 적용
  if (s.className === 'mage' && s.mageOverkillCarry > 0 && !isDummyMonster(s)) {
    const carry = Math.min(s.monsterHp - 1, s.mageOverkillCarry); // 즉사 방지 — 최소 1 HP 유지
    s.monsterHp -= carry;
    addLog(s, `[원소 공명] 이전 전투의 잉여 마력 −${carry}`);
    s.mageOverkillCarry = 0;
  }
  // 도적 전용: 새 몬스터에 기본 독 2스택 초기 부여 (들쭉날쭉 완화)
  if (s.className === 'rogue' && !isDummyMonster(s)) {
    const initDotBase = s.playerStats.atk;
    const INIT_POISON_MULT = 1.7;
    const initDotDmg = Math.round(initDotBase * INIT_POISON_MULT);
    for (let i = 0; i < 2; i++) {
      addEffect(s, { type: 'poison', value: initDotDmg, remainingActions: 3, source: 'player', dotMult: INIT_POISON_MULT, dotUseMatk: false });
    }
    addLog(s, `[독 사냥꾼] 몬스터 등장! 초기 독 2스택 부여`);
  }

  // 도적 전용: 이전 몬스터 처치 시 캡처한 독 스택 전이 (cap 20, 잔여 액션 50% 감소)
  if (s.className === 'rogue' && !isDummyMonster(s) && s.rogueDotCarry && s.rogueDotCarry.length > 0) {
    const transferCount = Math.min(20, s.rogueDotCarry.length);
    for (let i = 0; i < transferCount; i++) {
      const c = s.rogueDotCarry[i];
      // 전이 시 잔여 액션 50% 감소 (최소 1턴 보장) — 연쇄 처치 속도 완화
      const reducedActions = Math.max(1, Math.floor(c.remainingActions * 0.5));
      addEffect(s, { type: 'poison', value: c.value, remainingActions: reducedActions, source: 'player', dotMult: c.dotMult, dotUseMatk: c.dotUseMatk });
    }
    addLog(s, `[독 전이] 이전 몬스터의 독 ${transferCount}스택 이월 (잔여 50%)`);
    s.rogueDotCarry = [];
  }
  addLog(s, `${m.name}이(가) 나타났다!`);
}

// ── 플레이어 사망 ──
async function handlePlayerDeath(s: ActiveSession): Promise<void> {
  // 길드 보스: 부활 계열 총 1회만 허용 (부활 스킬 + undying_fury 중 먼저 발동되는 1회)
  if (s.guildBossRunId) {
    const gbRevived = s.statusEffects.some(e => e.id === 'gb_revive_used');
    // 1순위: 부활의 기적 (resurrect 스킬)
    const resurrect = s.statusEffects.find(e => e.type === 'resurrect' && e.source === 'monster');
    const resurrectUsed = s.statusEffects.some(e => e.id === 'resurrect_used');
    if (!gbRevived && resurrect && !resurrectUsed) {
      let healPct = resurrect.value;
      const resAmp = getPassive(s, 'resurrect_amp');
      if (resAmp > 0) healPct = Math.min(100, healPct + resAmp);
      s.playerHp = Math.round(s.playerMaxHp * healPct / 100);
      s.statusEffects = s.statusEffects.filter(e => e.type !== 'resurrect');
      s.statusEffects.push({ id: 'resurrect_used', type: 'resurrect', value: 0, remainingActions: 0, source: 'player' });
      s.statusEffects.push({ id: 'gb_revive_used', type: 'resurrect', value: 0, remainingActions: 0, source: 'player' });
      addLog(s, `부활의 기적! HP ${s.playerHp} 회복! (길드 보스 1회 한정)`);
      return;
    }
    // 2순위: undying_fury 패시브
    const undying = getPassive(s, 'undying_fury');
    const undyingUsed = s.statusEffects.some(e => e.id === 'undying_used');
    if (!gbRevived && undying > 0 && !undyingUsed) {
      s.playerHp = Math.round(s.playerMaxHp * undying / 100);
      addEffect(s, { type: 'invincible', value: 0, remainingActions: 1, source: 'monster' });
      s.statusEffects.push({ id: 'undying_used', type: 'invincible', value: 0, remainingActions: 0, source: 'player' });
      s.statusEffects.push({ id: 'gb_revive_used', type: 'resurrect', value: 0, remainingActions: 0, source: 'player' });
      addLog(s, `불굴의 의지! HP ${s.playerHp} 부활 + 무적 1행동 (길드 보스 1회 한정)`);
      return;
    }

    // 부활 불가 → run 종료 + 마을로 이동
    await flushGuildBossDamage(s);
    await markRunEndedByEngine(s.guildBossRunId, 'death').catch(e => console.error('[guild-boss] markRunEnded', e));
    addLog(s, '사망 — 길드 보스 입장 종료');
    s.playerHp = 0;
    s.guildBossRunId = null;
    s.guildBossBoss = null;
    await flushCharBatch(s.characterId);
    await query(
      'UPDATE characters SET hp=max_hp, location=$1, last_online_at=NOW() WHERE id=$2',
      ['village', s.characterId]
    );
    await query('DELETE FROM combat_sessions WHERE character_id=$1', [s.characterId]);
    await pushCombatState(s, true, true);
    activeSessions.delete(s.characterId);
    return;
  }

  // 부활 체크 (전투당 1회, 패시브: resurrect_amp 회복량 증가)
  const resurrect = s.statusEffects.find(e => e.type === 'resurrect' && e.source === 'monster');
  const alreadyResurrected = s.statusEffects.some(e => e.type === 'resurrect' && e.id === 'resurrect_used');
  if (resurrect && !alreadyResurrected) {
    let healPct = resurrect.value;
    const resAmp = getPassive(s, 'resurrect_amp');
    if (resAmp > 0) healPct = Math.min(100, healPct + resAmp);
    s.playerHp = Math.round(s.playerMaxHp * healPct / 100);
    s.statusEffects = s.statusEffects.filter(e => e.type !== 'resurrect');
    s.statusEffects.push({ id: 'resurrect_used', type: 'resurrect', value: 0, remainingActions: 0, source: 'player' });
    addLog(s, `부활의 기적! HP ${s.playerHp} 회복! (전투당 1회)`);
    return;
  }

  // 패시브: undying_fury (HP 0 시 1회 자동 부활, 30% HP)
  const undying = getPassive(s, 'undying_fury');
  if (undying > 0 && !s.statusEffects.some(e => e.type === 'invincible' && e.id === 'undying_used')) {
    s.playerHp = Math.round(s.playerMaxHp * undying / 100);
    addEffect(s, { type: 'invincible', value: 0, remainingActions: 1, source: 'monster' });
    // 사용 표시 (전투당 1회)
    s.statusEffects.push({ id: 'undying_used', type: 'invincible', value: 0, remainingActions: 0, source: 'player' });
    addLog(s, `불굴의 의지! HP ${s.playerHp} 부활 + 무적 1행동!`);
    return;
  }

  addLog(s, '사망했습니다.');
  s.playerHp = 0; // 클라이언트에 사망 상태 전달
  // 누적 배치 flush (exp/gold 유실 방지)
  await flushCharBatch(s.characterId);
  // 사망 시 마을 복귀 + HP 100% 회복
  await query(
    'UPDATE characters SET hp=max_hp, location=$1, last_online_at=NOW() WHERE id=$2',
    ['village', s.characterId]
  );
  await query('DELETE FROM combat_sessions WHERE character_id=$1', [s.characterId]);

  // 최종 상태 push — 사망 알림은 throttle 무시 (force=true)
  await pushCombatState(s, true, true);
  activeSessions.delete(s.characterId);
}

// ── 메인 틱 루프 ──
let lastTickAt = 0;
const TICK_TARGET_MS = 100;
// 세션별 마지막 tick 시각 (백그라운드 세션 간격 조절용)
const sessionLastTickAt = new Map<number, number>();
const OFFLINE_TICK_INTERVAL_MS = 1000; // 구독자 없는 세션은 1초 간격

async function combatTick(): Promise<void> {
  const now = Date.now();
  // 글로벌 dtMs — tick 지연 누적으로 대폭 가속되는 것 방지:
  //   상한 300ms (=tickScale 3) 로 clamp. 서버 스파이크 후 연속 행동 폭발 억제.
  const dtMsGlobal = lastTickAt === 0 ? TICK_TARGET_MS : Math.min(300, now - lastTickAt);
  lastTickAt = now;
  const tickScaleGlobal = dtMsGlobal / TICK_TARGET_MS;

  // 세션을 병렬로 처리
  const tasks: Promise<void>[] = [];
  for (const [charId, s] of activeSessions) {
    const hasSub = sessionHasSubscriber(charId);
    let tickScale: number;
    if (hasSub) {
      tickScale = tickScaleGlobal;
      sessionLastTickAt.set(charId, now);
    } else {
      // 구독자 없음 → 1초 간격으로만 tick
      const last = sessionLastTickAt.get(charId) ?? 0;
      const sDt = now - last;
      if (sDt < OFFLINE_TICK_INTERVAL_MS) continue;
      // sDt 상한 2000ms (=tickScale 20 → while 루프가 3으로 재차 컷) — 장기 lag 후 폭주 방어
      tickScale = Math.min(2000, sDt) / TICK_TARGET_MS;
      sessionLastTickAt.set(charId, now);
    }
    tasks.push((async () => {
    try {
      if (!s.monsterId) return;

      // 각성 카운터: 실제 경과 시간 기반 (1틱 = 100ms 기준)
      s.ticksSinceLastHit += tickScale;

      // 스피드 수정 적용
      let effectivePlayerSpeed = s.playerSpeed;
      let effectiveMonsterSpeed = s.monsterSpeed;
      for (const eff of s.statusEffects) {
        if (eff.type === 'speed_mod') {
          if (eff.source === 'player') {
            // player가 건 디버프 → 몬스터 스피드 감소
            effectiveMonsterSpeed = Math.round(effectiveMonsterSpeed * (1 + eff.value / 100));
          } else {
            // monster source → 플레이어 스피드 감소 (self_speed_mod)
            effectivePlayerSpeed = Math.round(effectivePlayerSpeed * (1 + eff.value / 100));
          }
        }
      }
      // 접두사: 저주(slow_pct) → 몬스터 속도 감소
      if (s.equipPrefixes.slow_pct) {
        effectiveMonsterSpeed = Math.round(effectiveMonsterSpeed * (1 - s.equipPrefixes.slow_pct / 100));
      }
      effectivePlayerSpeed = diminishSpeed(Math.max(10, effectivePlayerSpeed));
      effectiveMonsterSpeed = diminishSpeed(Math.max(10, effectiveMonsterSpeed));

      // 접두사: 재생(hp_regen) → 100ms당 1/10 (경과시간 스케일)
      if (s.equipPrefixes.hp_regen && s.playerHp < s.playerMaxHp && s.playerHp > 0) {
        s.playerHp = Math.min(s.playerMaxHp, s.playerHp + Math.round((s.equipPrefixes.hp_regen / 10) * tickScale));
        s.dirty = true;
      }

      // 게이지 충전 (GAUGE_FILL_RATE로 스케일링, 경과시간 반영)
      if (!s.waitingInput) {
        s.playerGauge += effectivePlayerSpeed * GAUGE_FILL_RATE * tickScale;
      }

      // 몬스터 게이지 충전 (동결/기절은 monsterAction에서 체크하며 tickDown)
      s.monsterGauge += effectiveMonsterSpeed * GAUGE_FILL_RATE * tickScale;

      // 몬스터·플레이어 행동을 게이지 우선순위 기반으로 인터리브 처리
      // 온라인 100ms tick 에선 자연스럽게 교대되는 행동을 offline tick(1000ms) 에서도 재현
      // maxActions 합산 상한으로 폭주 방지
      const maxTotalAct = Math.max(2, Math.min(20, Math.ceil(tickScale) * 2));
      let actLeft = maxTotalAct;

      const runMonsterAction = async (): Promise<'continue' | 'break' | 'return'> => {
        const preMonsterActIds = new Set(s.statusEffects.filter(e => e.source === 'monster').map(e => e.id));
        const hpBeforeMon = s.monsterHp;
        monsterAction(s);
        s.monsterGauge -= GAUGE_MAX;
        processDots(s, 'player');
        tickDownEffects(s, 'monster', preMonsterActIds);
        s.dirty = true;
        if (s.playerHp <= 0) { await handlePlayerDeath(s); return 'return'; }
        handleDummyTick(s, hpBeforeMon);
        if (s.monsterHp <= 0 && !isDummyMonster(s)) { await handleMonsterDeath(s); return 'break'; }
        return 'continue';
      };

      const runPlayerAction = async (): Promise<'continue' | 'break' | 'return'> => {
        if (!s.autoMode) {
          if (!s.waitingInput) {
            s.waitingInput = true;
            s.waitingSince = Date.now();
            s.playerGauge = GAUGE_MAX;
            s.dirty = true;
          }
          return 'break'; // 수동 모드 추가 처리 없음
        }
        s.playerGauge -= GAUGE_MAX;
        s.actionCount++;
        const newCd = new Map<number, number>();
        for (const [skId, cd] of s.skillCooldowns) {
          const next = cd - 1;
          if (next > 0) newCd.set(skId, next);
        }
        s.skillCooldowns = newCd;
        if (s.potionCooldown > 0) s.potionCooldown--;
        const preAutoIds = new Set(s.statusEffects.filter(e => e.source === 'player').map(e => e.id));
        const hpBeforePl = s.monsterHp;
        await autoAction(s);
        processDots(s, 'monster');
        tickDownEffects(s, 'player', preAutoIds);
        tickShield(s);
        s.dirty = true;
        const dealtThisAction = Math.max(0, hpBeforePl - s.monsterHp);
        if (s.afkMode && dealtThisAction > 0) s.afkDamage += dealtThisAction;
        if (s.guildBossRunId && dealtThisAction > 0) {
          s.guildBossDmgBuffer += dealtThisAction;
          s.guildBossHitsBuffer += 1;
          await flushGuildBossDamage(s);
        }
        handleDummyTick(s, hpBeforePl);
        if (s.monsterHp <= 0 && !isDummyMonster(s)) { await handleMonsterDeath(s); return 'break'; }
        if (s.playerHp <= 0) { await handlePlayerDeath(s); return 'return'; }
        return 'continue';
      };

      // 인터리브 루프 — 게이지 높은 쪽 먼저 행동 (동률이면 몬스터 선공)
      let playerDone = false, monsterDone = false;
      while (actLeft > 0 && !(playerDone && monsterDone)) {
        const mReady = !monsterDone && s.monsterGauge >= GAUGE_MAX;
        const pReady = !playerDone && s.playerGauge >= GAUGE_MAX;
        if (!mReady && !pReady) break;
        // 누가 먼저 행동할지: 게이지 높은 쪽, 동률이면 몬스터
        const monsterFirst = mReady && (!pReady || s.monsterGauge >= s.playerGauge);
        if (monsterFirst) {
          const r = await runMonsterAction();
          actLeft--;
          if (r === 'return') return;
          if (r === 'break') monsterDone = true;
        } else if (pReady) {
          const r = await runPlayerAction();
          actLeft--;
          if (r === 'return') return;
          if (r === 'break') playerDone = true;
        }
      }
      // 상태 push (dirty일 때만, 200ms throttle — push 성공 시에만 dirty 해제)
      if (s.dirty) {
        const pushed = await pushCombatState(s, true);
        if (pushed) s.dirty = false;
      }
    } catch (err) {
      console.error(`[combat] tick error for char ${charId}:`, err);
    }
    })());
  }
  await Promise.all(tasks);
}

// ── 메타 캐시 로드 (exp/부스트/포션/길드버프를 한 번에) ──
async function refreshSessionMeta(s: ActiveSession): Promise<void> {
  // 1) 캐릭터 exp/level + 부스트 (한 쿼리로 통합)
  try {
    const r = await query<{
      level: number; exp: string;
      exp_boost_until: string | null; gold_boost_until: string | null; drop_boost_until: string | null;
      atk_boost_until: string | null; hp_boost_until: string | null;
    }>(
      `SELECT level, exp, exp_boost_until, gold_boost_until, drop_boost_until, atk_boost_until, hp_boost_until
       FROM characters WHERE id = $1`,
      [s.characterId]
    );
    const row = r.rows[0];
    if (row) {
      s.cachedExp = Number(row.exp);
      s.cachedExpMax = expToNext(row.level);
      const now = new Date();
      const boosts: { name: string; until: string }[] = [];
      if (row.exp_boost_until && new Date(row.exp_boost_until) > now)
        boosts.push({ name: 'EXP 부스터 +50%', until: row.exp_boost_until });
      if (row.gold_boost_until && new Date(row.gold_boost_until) > now)
        boosts.push({ name: '골드 +50%', until: row.gold_boost_until });
      if (row.drop_boost_until && new Date(row.drop_boost_until) > now)
        boosts.push({ name: '드롭률 +50%', until: row.drop_boost_until });
      if (row.atk_boost_until && new Date(row.atk_boost_until) > now)
        boosts.push({ name: '공격력 +50%', until: row.atk_boost_until });
      if (row.hp_boost_until && new Date(row.hp_boost_until) > now)
        boosts.push({ name: '최대 HP +50%', until: row.hp_boost_until });
      s.cachedBoosts = boosts;
    }
  } catch {}

  // 2) HP 물약 수량
  try {
    const pr = await query<{ item_id: number; total: string }>(
      `SELECT item_id, COALESCE(SUM(quantity),0)::text AS total
       FROM character_inventory
       WHERE character_id = $1 AND item_id IN (100, 102, 104, 106)
       GROUP BY item_id`,
      [s.characterId]
    );
    const map: Record<number, number> = { 100: 0, 102: 0, 104: 0, 106: 0 };
    for (const row of pr.rows) map[row.item_id] = Number(row.total);
    s.cachedPotions = { small: map[100], mid: map[102], high: map[104], max: map[106] };
  } catch {}

  // 3) 길드 버프 (길드 스킬 + 24시간 길드 버프 합산)
  try {
    const gskills = await getGuildSkillsForCharacter(s.characterId);
    let goldPct = gskills.gold * GUILD_SKILL_PCT.gold;
    let expPct = gskills.exp * GUILD_SKILL_PCT.exp;
    let dropPct = gskills.drop * GUILD_SKILL_PCT.drop;

    // 길드 전체 24시간 버프 (+25%) — guild_boss_shop 의 guild_buff_24h_all 로 적립
    const gbR = await query<{ exp_boost_until: string | null; gold_boost_until: string | null; drop_boost_until: string | null }>(
      `SELECT g.exp_boost_until, g.gold_boost_until, g.drop_boost_until
       FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id
       WHERE gm.character_id = $1 LIMIT 1`,
      [s.characterId]
    );
    if (gbR.rowCount) {
      const now = new Date();
      if (gbR.rows[0].exp_boost_until && new Date(gbR.rows[0].exp_boost_until) > now) expPct += 25;
      if (gbR.rows[0].gold_boost_until && new Date(gbR.rows[0].gold_boost_until) > now) goldPct += 25;
      if (gbR.rows[0].drop_boost_until && new Date(gbR.rows[0].drop_boost_until) > now) dropPct += 25;
    }

    s.cachedGuildBuffs = { hp: gskills.hp * GUILD_SKILL_PCT.hp, gold: goldPct, exp: expPct, drop: dropPct };
  } catch {}

  s.metaDirty = false;
}

// ── 자동판매/드랍필터 세션 캐시 ──
// 킬마다 characters 테이블 조회하던 것을 세션 캐시로 전환.
// 설정 변경 엔드포인트(inventory.ts POST /auto-dismantle, /drop-filter)에서
// invalidateAutoSellCache(characterId) 호출 → null 로 리셋 → 다음 킬에 재로드.
async function loadAutoSellCache(s: ActiveSession): Promise<void> {
  const r = await query<{
    auto_dismantle_tiers: number; auto_sell_quality_max: number; auto_sell_protect_prefixes: string[];
    drop_filter_tiers: number; drop_filter_quality_max: number; drop_filter_common: boolean; drop_filter_protect_prefixes: string[];
  }>(
    `SELECT COALESCE(auto_dismantle_tiers, 0) AS auto_dismantle_tiers,
            COALESCE(auto_sell_quality_max, 0) AS auto_sell_quality_max,
            COALESCE(auto_sell_protect_prefixes, '{}') AS auto_sell_protect_prefixes,
            COALESCE(drop_filter_tiers, 0) AS drop_filter_tiers,
            COALESCE(drop_filter_quality_max, 0) AS drop_filter_quality_max,
            COALESCE(drop_filter_common, FALSE) AS drop_filter_common,
            COALESCE(drop_filter_protect_prefixes, '{}') AS drop_filter_protect_prefixes
     FROM characters WHERE id = $1`,
    [s.characterId]
  );
  const row = r.rows[0];
  s.autoSellCache = {
    auto_dismantle_tiers: row?.auto_dismantle_tiers ?? 0,
    auto_sell_quality_max: row?.auto_sell_quality_max ?? 0,
    auto_sell_protect_prefixes: row?.auto_sell_protect_prefixes ?? [],
    drop_filter_tiers: row?.drop_filter_tiers ?? 0,
    drop_filter_quality_max: row?.drop_filter_quality_max ?? 0,
    drop_filter_common: row?.drop_filter_common ?? false,
    drop_filter_protect_prefixes: row?.drop_filter_protect_prefixes ?? [],
  };
}

export function invalidateAutoSellCache(characterId: number): void {
  const s = activeSessions.get(characterId);
  if (s) s.autoSellCache = null;
}

// ── WebSocket Push ──
const PUSH_THROTTLE_FULL_MS = 150; // 진입 후 1분간 — ~6.7fps (egress 절감)
const PUSH_THROTTLE_LITE_MS = 1000; // 이후 — 1fps 저대역 (egress 대폭 절감)
const FULL_FPS_DURATION_MS = 60_000; // 5분 → 1분 (대부분 유저는 1분 내 적응)
async function pushCombatState(s: ActiveSession, inCombat: boolean, force = false): Promise<boolean> {
  const io = getIo();
  if (!io) return false;

  // Throttle: 강제(force) 또는 비전투(종료) 알림이 아니면 throttle 적용.
  // AFK 모드: 5초 throttle (대역폭 절감)
  // 사냥터 진입 후 5분간은 100ms throttle (풀 10fps), 이후엔 500ms throttle (저대역 모드 2fps).
  // 호출자는 반환값이 false면 dirty를 유지해 다음 틱에서 재시도해야 한다.
  if (!force && inCombat) {
    const now = Date.now();
    let minGap: number;
    if (s.afkMode) {
      minGap = 5000; // AFK 모드는 5초 throttle
    } else {
      const fieldAge = now - s.enteredFieldAt;
      minGap = fieldAge < FULL_FPS_DURATION_MS ? PUSH_THROTTLE_FULL_MS : PUSH_THROTTLE_LITE_MS;
    }
    if (now - s.lastPushAt < minGap) return false;
    s.lastPushAt = now;
  } else {
    s.lastPushAt = Date.now();
  }

  if (s.metaDirty) {
    await refreshSessionMeta(s);
  }

  const snapshot: CombatSnapshot = {
    inCombat,
    fieldName: s.fieldName,
    autoMode: s.autoMode,
    waitingInput: s.waitingInput,
    player: {
      hp: Math.max(0, s.playerHp),
      maxHp: s.playerMaxHp,
      gauge: Math.min(GAUGE_MAX, s.playerGauge),
      speed: s.playerSpeed,
      effects: s.statusEffects.filter(e => e.source === 'monster'),
    },
    monster: s.monsterId ? {
      name: s.monsterName,
      hp: Math.max(0, s.monsterHp),
      maxHp: s.monsterMaxHp,
      level: s.monsterLevel,
      gauge: Math.min(GAUGE_MAX, s.monsterGauge),
      speed: s.monsterSpeed,
      effects: s.statusEffects.filter(e => e.source === 'player'),
    } : undefined,
    skills: s.skills.map(sk => ({
      id: sk.id,
      name: sk.name,
      cooldownMax: sk.cooldown_actions,
      cooldownLeft: s.skillCooldowns.get(sk.id) || 0,
      usable: !s.skillCooldowns.has(sk.id) || (s.skillCooldowns.get(sk.id) || 0) <= 0,
      description: sk.description,
    })),
    log: s.log,
    autoPotion: { enabled: s.autoPotionEnabled, threshold: s.autoPotionThreshold },
    exp: s.cachedExp,
    expMax: s.cachedExpMax,
    serverTime: Date.now(),
  };

  snapshot.boosts = s.cachedBoosts;
  snapshot.potions = s.cachedPotions;
  snapshot.guildBuffs = s.cachedGuildBuffs;

  // 전사 분노 게이지
  if (s.className === 'warrior') snapshot.rage = s.rage;
  // 마법사 마나의 흐름
  if (s.className === 'mage') {
    snapshot.manaFlow = { stacks: s.manaFlowStacks, active: s.manaFlowActive };
  }
  // 도적 독의 공명
  if (s.className === 'rogue') {
    snapshot.poisonResonance = s.poisonResonance;
  }
  // 소환사 소환수 목록
  if (s.className === 'summoner') {
    snapshot.summons = s.statusEffects
      .filter(e => e.type === 'summon' && e.source === 'player' && e.remainingActions > 0)
      .map(e => ({
        skillName: e.summonSkillName || '',
        element: e.element,
        remainingActions: e.remainingActions,
      }));
  }
  // 처치 시간 통계 (전 직업 공통, 허수아비 제외)
  if (!isDummyMonster(s)) {
    const last = s.recentKillTimes.length > 0 ? s.recentKillTimes[s.recentKillTimes.length - 1] : 0;
    const avg = s.recentKillTimes.length > 0
      ? Math.round((s.recentKillTimes.reduce((a, b) => a + b, 0) / s.recentKillTimes.length) * 100) / 100
      : 0;
    const current = s.monsterSpawnAt > 0 ? Math.round((Date.now() - s.monsterSpawnAt) / 100) / 10 : 0;
    snapshot.killStats = { last, avg, count: s.recentKillTimes.length, current };
  }
  // 허수아비 존: 누적 데미지 + 경과 시간
  if (isDummyMonster(s)) {
    snapshot.dummy = {
      totalDamage: s.dummyDamageTotal,
      elapsedMs: s.dummyTrackStart > 0 ? Date.now() - s.dummyTrackStart : 0,
    };
  }

  // 영토 점령 보너스 정보
  try {
    snapshot.territoryBuffs = { expPct: 0, dropPct: 0 }; // 일시 비활성
    // snapshot.territoryBuffs = await getTerritoryBonusForChar(s.characterId, s.fieldId);
  } catch {}

  // AFK 모드: 누적 통계 + 무거운 필드 제거 (대역폭 절감)
  if (s.afkMode) {
    const elapsedMs = s.afkStartedAt > 0 ? Date.now() - s.afkStartedAt : 0;
    const elapsedSec = elapsedMs / 1000;
    const dps = elapsedSec > 0 ? Math.round(s.afkDamage / elapsedSec) : 0;
    snapshot.afk = {
      mode: true,
      elapsedMs,
      exp: s.afkExpGained,
      gold: s.afkGoldGained,
      kills: s.afkKills,
      damage: s.afkDamage,
      dps,
      quality100: s.afkQuality100,
      unique: s.afkUnique,
      t4Prefix: s.afkT4Prefix,
      playerHp: Math.max(0, s.playerHp),
      playerMaxHp: s.playerMaxHp,
      dead: s.playerHp <= 0,
    };
    // AFK 모드: 무거운 필드 제거
    snapshot.log = [];
    snapshot.skills = [];
    snapshot.summons = undefined;
    snapshot.killStats = undefined;
  }

  // 해당 유저의 소켓에만 emit
  io.emit(`combat:${s.characterId}`, snapshot);
  return true;
}

// ── 공개 API ──

// AFK(방치) 모드 토글
export async function setAfkMode(characterId: number, enabled: boolean): Promise<boolean> {
  const s = activeSessions.get(characterId);
  if (!s) return false;
  if (enabled && !s.afkMode) {
    // 카운터 리셋
    s.afkMode = true;
    s.afkStartedAt = Date.now();
    s.afkExpGained = 0;
    s.afkGoldGained = 0;
    s.afkKills = 0;
    s.afkDamage = 0;
    s.afkQuality100 = 0;
    s.afkUnique = 0;
    s.afkT4Prefix = 0;
  } else if (!enabled && s.afkMode) {
    s.afkMode = false;
  }
  s.dirty = true;
  // 즉시 한 번 강제 푸시 (UI 전환)
  await pushCombatState(s, true, true);
  return true;
}

// 길드 보스 전용 필드 (DB에 id=999로 등록 — fields 테이블 FK 충족용)
const GUILD_BOSS_FIELD_ID = 999;

export async function startGuildBossCombatSession(characterId: number, runId: string, boss: GuildBossData): Promise<void> {
  await startCombatSession(characterId, GUILD_BOSS_FIELD_ID, { guildBossRunId: runId, guildBossBoss: boss });
}

export async function endGuildBossCombatSession(characterId: number): Promise<void> {
  const s = activeSessions.get(characterId);
  if (!s) return;
  if (s.guildBossRunId) await flushGuildBossDamage(s);
  s.guildBossRunId = null;
  s.guildBossBoss = null;
  activeSessions.delete(characterId);
}

export async function startCombatSession(
  characterId: number,
  fieldId: number,
  guildBossOpts?: { guildBossRunId: string; guildBossBoss: GuildBossData }
): Promise<void> {
  // 기존 세션 정리
  activeSessions.delete(characterId);

  const char = await loadCharacter(characterId);
  if (!char) throw new Error('character not found');

  const fr = await query<{ name: string }>('SELECT name FROM fields WHERE id = $1', [fieldId]);
  const fieldName = fr.rows[0]?.name || '알 수 없는 필드';

  const eff = await getEffectiveStats(char);
  const skills = await getCharSkills(characterId, char.class_name, char.level);
  const passivesRaw = await getNodePassives(characterId);
  const passives = buildPassiveMap(passivesRaw);
  const equipPrefixes = await loadEquipPrefixes(characterId);

  // 전투 시작 시 키스톤/접두사 보너스 추가 적용 (getEffectiveStats와 합쳐 이중 적용)
  // 기존 라이브 밸런스를 유지하기 위해 보존 — refreshSessionStats에서도 동일하게 적용.
  applyCombatStatBoost(eff, passives, equipPrefixes, char.max_hp);

  const session: ActiveSession = {
    characterId,
    className: char.class_name,
    fieldId,
    monsterId: null,
    monsterName: '',
    monsterLevel: 0,
    monsterHp: 0,
    monsterMaxHp: 0,
    monsterSpeed: 100,
    monsterGauge: 0,
    monsterStats: { str: 0, dex: 0, int: 0, vit: 0, spd: 100, cri: 0, maxHp: 0, atk: 0, matk: 0, def: 0, mdef: 0, dodge: 0, accuracy: 80 },
    playerHp: Math.min(char.hp, eff.maxHp),
    playerMaxHp: eff.maxHp,
    playerGauge: 0,
    playerSpeed: eff.spd,
    playerStats: eff,
    autoMode: true,
    waitingInput: false,
    waitingSince: 0,
    autoPotionEnabled: char.auto_potion_enabled ?? true,
    autoPotionThreshold: char.auto_potion_threshold ?? 30,
    potionCooldown: 0,
    skillCooldowns: new Map(),
    skillLastUsed: new Map(),
    statusEffects: [],
    actionCount: 0,
    log: [],
    skills,
    passives,
    equipPrefixes,
    fieldName,
    dirty: true,
    userId: char.user_id,
    ticksSinceLastHit: 0,
    hasFirstStrike: true,
    missStack: 0,
    dodgeBurstPending: false,
    rage: 0, // 전사 분노 — 하단에서 DB 복원
    manaFlowStacks: 0,
    manaFlowActive: 0,
    dummyDamageTotal: 0,
    dummyTrackStart: 0,
    mageOverkillCarry: 0,
    poisonResonance: 0,
    comboKills: 0,
    hasFirstSkill: true,
    monsterSpawnAt: Date.now(),
    recentKillTimes: [],
    lastPushAt: 0,
    enteredFieldAt: Date.now(),
    metaDirty: true,
    cachedExp: Number(char.exp) || 0,
    cachedExpMax: expToNext(char.level),
    cachedBoosts: [],
    cachedPotions: { small: 0, mid: 0, high: 0, max: 0 },
    cachedGuildBuffs: { hp: 0, gold: 0, exp: 0, drop: 0 },
    monsterDef: null,
    autoSellCache: null,
    afkMode: false,
    afkStartedAt: 0,
    afkExpGained: 0,
    afkGoldGained: 0,
    afkKills: 0,
    afkDamage: 0,
    afkQuality100: 0,
    afkUnique: 0,
    afkT4Prefix: 0,
    guildBossRunId: guildBossOpts?.guildBossRunId ?? null,
    guildBossBoss: guildBossOpts?.guildBossBoss ?? null,
    guildBossDmgBuffer: 0,
    guildBossHitsBuffer: 0,
    guildBossStartedAt: guildBossOpts ? Date.now() : 0,
  };

  // 패시브: counter_incarnation (상시 반사)
  const counterInc = passives.get('counter_incarnation') || 0;
  if (counterInc > 0) {
    session.statusEffects.push({ id: 'counter_inc', type: 'damage_reflect', value: counterInc, remainingActions: 99999, source: 'monster' });
  }

  // DB 세션 — 소환수 복원용으로 기존 세션 먼저 읽기
  let savedSummons: any[] | null = null;
  let savedCooldowns: Record<string, number> | null = null;
  if (char.class_name === 'summoner') {
    try {
      const prev = await query<{ status_effects: any; skill_cooldowns: any }>(
        'SELECT status_effects, skill_cooldowns FROM combat_sessions WHERE character_id = $1', [characterId]
      );
      if (prev.rows[0]?.status_effects && Array.isArray(prev.rows[0].status_effects)) {
        savedSummons = prev.rows[0].status_effects.filter((e: any) => e.type === 'summon' && e.remainingActions > 0);
      }
      if (prev.rows[0]?.skill_cooldowns && typeof prev.rows[0].skill_cooldowns === 'object') {
        savedCooldowns = prev.rows[0].skill_cooldowns;
      }
    } catch {}
  }
  await query('DELETE FROM combat_sessions WHERE character_id = $1', [characterId]);
  await query(
    `INSERT INTO combat_sessions
     (character_id, field_id, player_hp, player_gauge, player_speed, auto_mode)
     VALUES ($1, $2, $3, 0, $4, TRUE)`,
    [characterId, fieldId, char.hp, eff.spd]
  );
  await query('UPDATE characters SET location = $1, last_online_at = NOW() WHERE id = $2',
    [`field:${fieldId}`, characterId]);

  // 소환수 복원: 이전 세션에서 저장된 소환수 + 쿨다운 복원
  if (savedSummons && savedSummons.length > 0) {
    for (const eff of savedSummons) {
      session.statusEffects.push({
        id: `restored_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: eff.type, value: eff.value, remainingActions: eff.remainingActions,
        source: eff.source || 'player', dotMult: eff.dotMult,
        element: eff.element, summonSkillName: eff.summonSkillName, dotUseMatk: eff.dotUseMatk,
      });
    }
    console.log(`[combat] restored ${savedSummons.length} summons for char ${characterId}`);
  }
  if (savedCooldowns) {
    for (const [k, v] of Object.entries(savedCooldowns)) {
      if (typeof v === 'number' && v > 0) session.skillCooldowns.set(Number(k), v);
    }
  }

  await spawnMonsterForSession(session);

  // 전사 분노 DB 복원 — 전투 세션 사이 이전
  if (char.class_name === 'warrior') {
    try {
      const rr = await query<{ warrior_rage: number }>('SELECT COALESCE(warrior_rage, 0) AS warrior_rage FROM characters WHERE id = $1', [characterId]);
      session.rage = Math.min(100, Math.max(0, rr.rows[0]?.warrior_rage || 0));
    } catch {}
  }

  activeSessions.set(characterId, session);

  // 전투 루프 시작 (아직 안 돌고 있으면)
  ensureCombatLoop();
}

export async function stopCombatSession(characterId: number, opts: { keepLocation?: boolean } = {}): Promise<void> {
  // 누적된 exp/gold/kills 먼저 DB에 반영
  await flushCharBatch(characterId);
  const s = activeSessions.get(characterId);
  if (s) {
    // 소환수 상태 저장 (복원용)
    if (s.className === 'summoner') {
      const summons = s.statusEffects.filter(e => e.type === 'summon' && e.source === 'player' && e.remainingActions > 0);
      const cdObj: Record<string, number> = {};
      for (const [k, v] of s.skillCooldowns) cdObj[String(k)] = v;
      try {
        await query(
          'UPDATE combat_sessions SET status_effects = $1::jsonb, skill_cooldowns = $2::jsonb WHERE character_id = $3',
          [JSON.stringify(summons), JSON.stringify(cdObj), characterId]
        );
      } catch {}
    }
    if (opts.keepLocation) {
      // 유휴 종료: location 유지 → 유저 재접속 시 오프라인 보상 계산 트리거됨
      await query(
        'UPDATE characters SET hp = LEAST(GREATEST(1, $1), max_hp), last_online_at=NOW() WHERE id=$2',
        [s.playerHp, characterId]
      );
    } else {
      await query(
        'UPDATE characters SET hp = LEAST(GREATEST(1, $1), max_hp), location=$2, last_online_at=NOW() WHERE id=$3',
        [s.playerHp, 'village', characterId]
      );
    }
    // 전사 분노 DB 저장 (다음 전투 세션에 이어짐)
    if (s.className === 'warrior') {
      try {
        await query('UPDATE characters SET warrior_rage = $1 WHERE id = $2', [Math.max(0, Math.min(100, s.rage)), characterId]);
      } catch {}
    }
  }
  await query('DELETE FROM combat_sessions WHERE character_id=$1', [characterId]);
  activeSessions.delete(characterId);
}

export async function refreshSessionSkills(characterId: number): Promise<void> {
  const s = activeSessions.get(characterId);
  if (!s) return;
  const char = await loadCharacter(characterId);
  if (!char) return;
  s.skills = await getCharSkills(characterId, s.className, char.level);
  s.dirty = true;
}

export function toggleAutoMode(characterId: number): boolean {
  const s = activeSessions.get(characterId);
  if (!s) return true;
  s.autoMode = !s.autoMode;
  if (s.autoMode) {
    s.waitingInput = false;
  }
  s.dirty = true;
  return s.autoMode;
}

export async function setAutoPotionConfig(characterId: number, enabled: boolean, threshold: number): Promise<{ enabled: boolean; threshold: number } | null> {
  const s = activeSessions.get(characterId);
  if (!s) return null;
  s.autoPotionEnabled = enabled;
  s.autoPotionThreshold = Math.max(5, Math.min(80, threshold));
  s.dirty = true;
  // DB 영구 저장
  await query('UPDATE characters SET auto_potion_enabled = $1, auto_potion_threshold = $2 WHERE id = $3',
    [s.autoPotionEnabled, s.autoPotionThreshold, characterId]);
  return { enabled: s.autoPotionEnabled, threshold: s.autoPotionThreshold };
}

export function getAutoPotionConfig(characterId: number): { enabled: boolean; threshold: number } | null {
  const s = activeSessions.get(characterId);
  if (!s) return null;
  return { enabled: s.autoPotionEnabled, threshold: s.autoPotionThreshold };
}

export function resetDummyTracking(characterId: number): boolean {
  const s = activeSessions.get(characterId);
  if (!s) return false;
  s.dummyDamageTotal = 0;
  s.dummyTrackStart = 0;
  s.dirty = true;
  return true;
}

export async function manualSkillUse(characterId: number, skillId: number): Promise<boolean> {
  const s = activeSessions.get(characterId);
  if (!s || !s.waitingInput) return false;

  const skill = s.skills.find(sk => sk.id === skillId);
  if (!skill) return false;

  const cd = s.skillCooldowns.get(skillId);
  const manaBurst = s.className === 'mage' && s.manaFlowActive > 0;
  if (cd && cd > 0 && !manaBurst) return false;

  s.waitingInput = false;
  s.playerGauge = 0;
  s.actionCount++;

  // 쿨다운 감소 (안전한 새 맵 생성)
  const newCdMap = new Map<number, number>();
  for (const [skId, cdVal] of s.skillCooldowns) {
    const next = cdVal - 1;
    if (next > 0) newCdMap.set(skId, next);
  }
  s.skillCooldowns = newCdMap;

  const preManualIds = new Set(s.statusEffects.filter(e => e.source === 'player').map(e => e.id));
  const hpBeforeManual = s.monsterHp;
  await executeSkill(s, skill);
  processDots(s, 'monster');
  tickDownEffects(s, 'player', preManualIds);
  tickShield(s);
  s.dirty = true;

  handleDummyTick(s, hpBeforeManual);
  if (s.monsterHp <= 0 && !isDummyMonster(s)) await handleMonsterDeath(s);
  if (s.playerHp <= 0) await handlePlayerDeath(s);

  return true;
}

export async function getCombatSnapshot(characterId: number): Promise<CombatSnapshot | null> {
  const s = activeSessions.get(characterId);
  if (!s) return null;

  if (s.metaDirty) await refreshSessionMeta(s);

  return {
    inCombat: true,
    fieldName: s.fieldName,
    autoMode: s.autoMode,
    waitingInput: s.waitingInput,
    player: {
      hp: Math.max(0, s.playerHp),
      maxHp: s.playerMaxHp,
      gauge: Math.min(GAUGE_MAX, s.playerGauge),
      speed: s.playerSpeed,
      effects: s.statusEffects.filter(e => e.source === 'monster'),
    },
    monster: s.monsterId ? {
      name: s.monsterName,
      hp: Math.max(0, s.monsterHp),
      maxHp: s.monsterMaxHp,
      level: s.monsterLevel,
      gauge: Math.min(GAUGE_MAX, s.monsterGauge),
      speed: s.monsterSpeed,
      effects: s.statusEffects.filter(e => e.source === 'player'),
    } : undefined,
    skills: s.skills.map(sk => ({
      id: sk.id,
      name: sk.name,
      cooldownMax: sk.cooldown_actions,
      cooldownLeft: s.skillCooldowns.get(sk.id) || 0,
      usable: !s.skillCooldowns.has(sk.id) || (s.skillCooldowns.get(sk.id) || 0) <= 0,
      description: sk.description,
    })),
    log: s.log,
    autoPotion: { enabled: s.autoPotionEnabled, threshold: s.autoPotionThreshold },
    exp: s.cachedExp,
    expMax: s.cachedExpMax,
    boosts: s.cachedBoosts,
    potions: s.cachedPotions,
    guildBuffs: s.cachedGuildBuffs,
    serverTime: Date.now(),
    guildBossRunId: s.guildBossRunId ?? undefined,
  };
}

export function isInCombat(characterId: number): boolean {
  return activeSessions.has(characterId);
}

// 관리자용: 실시간 킬 통계 조회 (인메모리 세션에서만 유효)
export function getKillStats(characterId: number): {
  inCombat: boolean;
  fieldName?: string;
  monsterName?: string;
  recentKillTimes: number[];
  avg: number;
  last: number;
  count: number;
  currentMonsterElapsedSec: number;
} | null {
  const s = activeSessions.get(characterId);
  if (!s) return { inCombat: false, recentKillTimes: [], avg: 0, last: 0, count: 0, currentMonsterElapsedSec: 0 };
  const times = s.recentKillTimes.slice();
  const count = times.length;
  const avg = count > 0 ? Math.round((times.reduce((a, b) => a + b, 0) / count) * 100) / 100 : 0;
  const last = count > 0 ? times[count - 1] : 0;
  const current = s.monsterSpawnAt > 0 ? Math.round((Date.now() - s.monsterSpawnAt) / 100) / 10 : 0;
  return {
    inCombat: true,
    fieldName: s.fieldName,
    monsterName: s.monsterName,
    recentKillTimes: times,
    avg,
    last,
    count,
    currentMonsterElapsedSec: current,
  };
}

// 키스톤 패시브 + atk_pct/matk_pct 접두사 2차 적용
// getEffectiveStats가 이미 한 번 적용한 위에 한 번 더 곱하여 기존 라이브 밸런스를 유지
// (startCombatSession과 refreshSessionStats 양쪽이 동일한 값을 내도록 강제)
export function applyCombatStatBoost(
  eff: import('../game/formulas.js').EffectiveStats,
  passives: Map<string, number>,
  equipPrefixes: Record<string, number>,
  charMaxHp: number,
): void {
  const pMap = passives;
  if (pMap.has('war_god')) eff.atk = Math.round(eff.atk * (1 + pMap.get('war_god')! / 100));
  if (pMap.has('shadow_dance')) eff.dodge += pMap.get('shadow_dance')!;
  if (pMap.has('trickster')) eff.cri += pMap.get('trickster')!;
  if (pMap.has('iron_will')) eff.def = Math.round(eff.def * (1 + pMap.get('iron_will')! / 100));
  const matkBonus = pMap.get('mana_overload') || 0;
  if (matkBonus > 0) eff.matk = Math.round(eff.matk * (1 + matkBonus / 100));
  if (pMap.has('focus_mastery')) eff.accuracy += pMap.get('focus_mastery')!;
  if (pMap.has('berserker_heart')) {
    const v = pMap.get('berserker_heart')!;
    eff.atk = Math.round(eff.atk * (1 + v / 100));
    eff.def = Math.round(eff.def * (1 - v / 200));
  }
  if (pMap.has('sanctuary_guard')) {
    eff.maxHp += Math.round(charMaxHp * pMap.get('sanctuary_guard')! / 100);
  }
  if (pMap.has('balance_apostle')) {
    const v = pMap.get('balance_apostle')!;
    eff.atk = Math.round(eff.atk * (1 + v / 100));
    eff.matk = Math.round(eff.matk * (1 + v / 100));
    eff.def = Math.round(eff.def * (1 + v / 100));
  }
  if (equipPrefixes.atk_pct) eff.atk = Math.round(eff.atk * (1 + equipPrefixes.atk_pct / 100));
  if (equipPrefixes.matk_pct) eff.matk = Math.round(eff.matk * (1 + equipPrefixes.matk_pct / 100));
}

// 장비/노드 변경 시 인메모리 세션 스탯 갱신
export async function refreshSessionStats(characterId: number): Promise<void> {
  const s = activeSessions.get(characterId);
  if (!s) return;
  const char = await loadCharacter(characterId);
  if (!char) return;
  const eff = await getEffectiveStats(char);
  s.equipPrefixes = await loadEquipPrefixes(characterId);
  s.passives = buildPassiveMap(await getNodePassives(characterId)); // 노드 패시브 재로드
  // 전투 시작 시와 동일한 2차 버프를 적용하여 인벤 조작 후 데미지 드랍 방지
  applyCombatStatBoost(eff, s.passives, s.equipPrefixes, char.max_hp);
  s.playerStats = eff;
  s.playerMaxHp = eff.maxHp;
  s.playerSpeed = eff.spd;
  // 활성 도트 데미지 재계산 (장비/스탯 변경 즉시 반영)
  for (const eff of s.statusEffects) {
    if ((eff.type === 'dot' || eff.type === 'poison') && eff.source === 'player' && eff.dotMult !== undefined) {
      const base = eff.dotUseMatk ? s.playerStats.matk : s.playerStats.atk;
      eff.value = Math.round(base * eff.dotMult);
    }
  }
  s.dirty = true;
}

export function getCombatHp(characterId: number): number | null {
  const s = activeSessions.get(characterId);
  return s ? Math.max(0, s.playerHp) : null;
}

// 세션 지속 정책 (방법 3 — 온라인·오프라인 동일 시뮬레이션)
// - WS 구독자 유무 무관하게 combat_sessions 은 계속 틱 실행
// - 최대 24h 연속 실행 후 자동 종료 (리소스 관리)
// - 24h 이후엔 stopCombatSession(keepLocation=true) 으로 필드 유지 → 재접속 시 자동 재시작
const sessionStartedMap = new Map<number, number>();
export function sessionHasSubscriber(characterId: number): boolean {
  const io = getIo();
  if (!io) return true;
  // 1) combat:{charId} 구독자 (사냥 화면 보고 있는 중) → 즉시 true
  const combatRoom = io.sockets.adapter.rooms.get(`combat:${characterId}`);
  if ((combatRoom?.size || 0) > 0) return true;
  // 2) 폴백 — 같은 userId 의 소켓이 어딘가(인벤토리 등)라도 연결돼있으면 유지
  const s = activeSessions.get(characterId);
  if (!s) return false;
  for (const [, sock] of io.sockets.sockets) {
    if (sock.data?.userId === s.userId) return true;
  }
  return false;
}
const SESSION_MAX_MS = 24 * 60 * 60_000; // 최대 24시간 연속 시뮬레이션
setInterval(() => {
  const io = getIo();
  if (!io) return;
  const now = Date.now();
  let cleaned = 0;
  for (const charId of activeSessions.keys()) {
    const s = activeSessions.get(charId);
    if (!s) continue;
    // 세션 시작 시각 기록 (초회)
    if (!sessionStartedMap.has(charId)) {
      sessionStartedMap.set(charId, now);
      continue;
    }
    const startedAt = sessionStartedMap.get(charId)!;
    // 구독자 있으면 타이머 리셋 (온라인 플레이 중)
    if (sessionHasSubscriber(charId)) {
      sessionStartedMap.set(charId, now);
      continue;
    }
    // 구독자 없는 상태로 24h 경과 → 종료
    if (now - startedAt > SESSION_MAX_MS) {
      sessionStartedMap.delete(charId);
      cleaned++;
      stopCombatSession(charId, { keepLocation: true }).catch(e => console.error('[cleanup] stop err', charId, e));
    }
  }
  if (cleaned > 0) console.log(`[combat-cleanup] stopped ${cleaned} offline sessions (>24h, no subscriber, remaining=${activeSessions.size})`);
}, 60_000);

// 틱 성능 통계 (30초마다 요약 출력)
let tickStats = { count: 0, totalMs: 0, maxMs: 0, overLimit: 0, skipped: 0 };
setInterval(() => {
  if (tickStats.count === 0 && tickStats.skipped === 0) return;
  const avg = tickStats.count > 0 ? (tickStats.totalMs / tickStats.count).toFixed(1) : '0';
  console.log(`[combat-perf] ticks=${tickStats.count} avg=${avg}ms max=${tickStats.maxMs}ms over100ms=${tickStats.overLimit} skipped=${tickStats.skipped} sessions=${activeSessions.size}`);
  tickStats = { count: 0, totalMs: 0, maxMs: 0, overLimit: 0, skipped: 0 };
}, 30_000);

function ensureCombatLoop() {
  if (combatInterval) return;
  lastTickAt = 0; // 재시작 시 초기화
  combatInterval = setInterval(() => {
    if (tickRunning) { tickStats.skipped++; return; }
    tickRunning = true;
    const start = Date.now();
    combatTick()
      .catch(err => console.error('[combat] loop error:', err))
      .finally(() => {
        const ms = Date.now() - start;
        tickStats.count++;
        tickStats.totalMs += ms;
        if (ms > tickStats.maxMs) tickStats.maxMs = ms;
        if (ms > 100) {
          tickStats.overLimit++;
          if (ms > 500) console.warn(`[combat-perf] SLOW TICK ${ms}ms (sessions=${activeSessions.size})`);
        }
        tickRunning = false;
      });
  }, 100); // 100ms 틱
  console.log('[combat] engine started (100ms tick)');
}

// 서버 시작 시 DB 세션 정리
// combat_sessions 의 status_effects JSONB 에는 소환사 소환수가 저장돼있으므로 삭제 금지.
// 대신 '마을에 있는' 캐릭터의 stale row 만 제거 (위치 불일치 = 실제로 세션 필요 없음).
// 유저 재접속 시 /combat/state 가 startCombatSession 을 호출하며 savedSummons 복원.
export async function restoreCombatSessions(): Promise<void> {
  try {
    const r = await query(`
      DELETE FROM combat_sessions
      WHERE character_id IN (
        SELECT id FROM characters WHERE location IS NULL OR location NOT LIKE 'field:%'
      )
    `);
    if (r.rowCount && r.rowCount > 0) {
      console.log(`[combat] cleared ${r.rowCount} orphan sessions (character not in field)`);
    }
  } catch (e) {
    console.error('[combat] restoreCombatSessions cleanup error:', e);
  }
}
