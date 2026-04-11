// v0.9 게이지 기반 전투 엔진
import { query } from '../db/pool.js';
import { calcDamage, type EffectiveStats } from '../game/formulas.js';
import { applyExpGain } from '../game/leveling.js';
import { getGuildSkillsForCharacter, contributeGuildExp, GUILD_SKILL_PCT } from '../game/guild.js';
import { addTerritoryScore, getTerritoryBonusForChar } from '../game/territory.js';
import { loadCharacter, getEffectiveStats, getNodePassives } from '../game/character.js';
import { addItemToInventory, deliverToMailbox } from '../game/inventory.js';
import { expToNext } from '../game/leveling.js';
import { trackMonsterKill } from '../routes/quests.js';
import { trackDailyQuestProgress } from '../routes/dailyQuests.js';
import { checkAndUnlockAchievements } from '../game/achievements.js';
import type { Stats } from '../game/classes.js';
// StatusEffect and CombatSnapshot types defined locally to avoid import path issues

interface StatusEffect {
  id: string;
  type: string;
  value: number;
  remainingActions: number;
  source: 'player' | 'monster';
}

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
}
import { getIo } from '../ws/io.js';

const GAUGE_MAX = 1000;
const MAX_LOG = 30;
// 100ms 틱에서 speed를 이 비율로 충전 (0.2 = speed 300일 때 ~1.7초 행동주기)
const GAUGE_FILL_RATE = 0.2;

// 속도 감쇠 — 소프트캡 300, 이후 평방근 감쇠
// 300 이하: 그대로, 300 이상: 300 + sqrt(초과분) * 15
// 예) spd 300→300, 500→326, 800→367, 1200→413
function diminishSpeed(rawSpd: number): number {
  const SOFT_CAP = 300;
  if (rawSpd <= SOFT_CAP) return rawSpd;
  return Math.round(SOFT_CAP + Math.sqrt(rawSpd - SOFT_CAP) * 15);
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

interface SkillDef {
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
  statusEffects: StatusEffect[];
  actionCount: number;
  log: string[];
  skills: SkillDef[];
  passives: { key: string; value: number }[];
  equipPrefixes: Record<string, number>;
  fieldName: string;
  dirty: boolean;
  ticksSinceLastHit: number; // 각성 접두사용 (5초 = 50틱)
  hasFirstStrike: boolean; // 약점간파 (몬스터당 첫 공격)
  userId: number;
}

const activeSessions = new Map<number, ActiveSession>();
let combatInterval: ReturnType<typeof setInterval> | null = null;

// ── 헬퍼 ──

function monsterToEffective(m: MonsterDef): EffectiveStats {
  const s = m.stats;
  return {
    str: s.str, dex: s.dex, int: s.int, vit: s.vit, spd: s.spd, cri: s.cri,
    maxHp: m.max_hp,
    atk: s.str * 1.0,
    matk: s.int * 1.2,
    def: s.vit * 0.8,
    mdef: s.int * 0.5,
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
async function loadEquipPrefixes(characterId: number): Promise<Record<string, number>> {
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

const MAX_COMBAT_SKILLS = 6;

async function getCharSkills(characterId: number, className: string, level: number): Promise<SkillDef[]> {
  // 자동 학습 (신규 스킬)
  const newSkills = await query<{ id: number }>(
    `SELECT s.id FROM skills s
     WHERE s.class_name = $1 AND s.required_level <= $2
       AND NOT EXISTS (SELECT 1 FROM character_skills cs WHERE cs.character_id = $3 AND cs.skill_id = s.id)`,
    [className, level, characterId]
  );
  for (const sk of newSkills.rows) {
    // 현재 auto_use ON 개수 체크 후 6개 미만이면 ON (기본기 제외)
    const countR = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
       WHERE cs.character_id = $1 AND cs.auto_use = TRUE AND s.cooldown_actions > 0`, [characterId]
    );
    const autoOn = Number(countR.rows[0].cnt) < MAX_COMBAT_SKILLS;
    await query(
      'INSERT INTO character_skills (character_id, skill_id, auto_use) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [characterId, sk.id, autoOn]
    );
  }

  // 기본기 (cooldown=0) 항상 포함
  const basicR = await query<SkillDef>(
    `SELECT s.id, s.name, s.damage_mult, s.kind, s.cooldown_actions, s.flat_damage,
            s.effect_type, s.effect_value, s.effect_duration, s.required_level
     FROM skills s
     WHERE s.class_name = $1 AND s.required_level <= $2 AND s.cooldown_actions = 0
     ORDER BY s.required_level ASC`,
    [className, level]
  );
  // auto_use=true 스킬 (기본기 제외), 최대 6개
  const slotR = await query<SkillDef>(
    `SELECT s.id, s.name, s.damage_mult, s.kind, s.cooldown_actions, s.flat_damage,
            s.effect_type, s.effect_value, s.effect_duration, s.required_level
     FROM skills s
     JOIN character_skills cs ON cs.skill_id = s.id AND cs.character_id = $3
     WHERE s.class_name = $1 AND s.required_level <= $2 AND cs.auto_use = TRUE AND s.cooldown_actions > 0
     ORDER BY s.required_level ASC
     LIMIT $4`,
    [className, level, characterId, MAX_COMBAT_SKILLS]
  );
  return [...basicR.rows, ...slotR.rows];
}

// 드롭률 배율: 기본 x0.1 (드롭 부스터로 1.5배)
// 유니크 아이템은 배율 적용 없이 DB 확률 그대로 사용
const DROP_RATE_MULT = 0.1;

// 유니크 아이템 ID 캐시 (startup 시 로드)
const uniqueItemIds = new Set<number>();
export async function loadUniqueItemIds() {
  const r = await query<{ id: number }>("SELECT id FROM items WHERE grade = 'unique'");
  uniqueItemIds.clear();
  for (const row of r.rows) uniqueItemIds.add(row.id);
  console.log(`[drop] 유니크 ${uniqueItemIds.size}개 캐시`);
}

function rollDrops(m: MonsterDef, dropBoost: boolean = false, guildDropPct: number = 0): { itemId: number; qty: number }[] {
  const drops: { itemId: number; qty: number }[] = [];
  const boostMult = dropBoost ? 1.5 : 1.0;
  const guildMult = 1 + guildDropPct / 100;
  for (const d of m.drop_table || []) {
    // 유니크는 DROP_RATE_MULT 제외 (DB 확률 그대로)
    const rateMult = uniqueItemIds.has(d.itemId) ? 1.0 : DROP_RATE_MULT;
    if (Math.random() < d.chance * rateMult * boostMult * guildMult) {
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

function addEffect(s: ActiveSession, effect: Omit<StatusEffect, 'id'>) {
  // speed_mod: 중첩 불가 — 기존 효과를 더 강한 것으로 갱신
  if (effect.type === 'speed_mod') {
    const existing = s.statusEffects.find(e => e.type === 'speed_mod' && e.source === effect.source && e.remainingActions > 0);
    if (existing) {
      // 더 강한 감소 또는 더 긴 지속시간으로 갱신
      if (Math.abs(effect.value) >= Math.abs(existing.value)) {
        existing.value = effect.value;
        existing.remainingActions = Math.max(existing.remainingActions, effect.remainingActions);
      }
      return;
    }
  }
  // dot/poison: 중첩 허용 (그대로 push)
  s.statusEffects.push({ ...effect, id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}` });
}

function hasEffect(s: ActiveSession, target: 'player' | 'monster', type: string): boolean {
  return s.statusEffects.some(e => e.source === target && e.type === type && e.remainingActions > 0);
}

// 패시브 값 조회 (없으면 0)
function getPassive(s: ActiveSession, key: string): number {
  const p = s.passives.find(p => p.key === key);
  return p ? p.value : 0;
}

function tickDownEffects(s: ActiveSession, actor: 'player' | 'monster') {
  for (const eff of s.statusEffects) {
    if (eff.source === actor && eff.remainingActions > 0) {
      eff.remainingActions--;
    }
  }
  s.statusEffects = s.statusEffects.filter(e => e.remainingActions > 0 || e.type === 'resurrect');
}

// ── 도트 데미지 처리 ──
// 도트는 방어력의 50%만 무시 (= 방어력의 25%만큼 차감)
const DOT_DEF_IGNORE_PCT = 0.5; // 50% 무시
function processDots(s: ActiveSession, target: 'player' | 'monster') {
  const dots = s.statusEffects.filter(e =>
    (e.type === 'dot' || e.type === 'poison') &&
    ((target === 'monster' && e.source === 'player') || (target === 'player' && e.source === 'monster')) &&
    e.remainingActions > 0
  );
  if (dots.length === 0) return;
  let total = 0;
  // 방어 차감량: 일반 데미지 공식의 def × 0.5 중 50%만 적용 → def × 0.25
  // 마법 클래스는 mdef, 일반은 def 사용
  const useMatk = MATK_CLASSES.has(s.className);
  let defReduce = 0;
  if (target === 'monster') {
    const monsterDef = useMatk ? s.monsterStats.mdef : s.monsterStats.def;
    defReduce = Math.round(monsterDef * 0.5 * (1 - DOT_DEF_IGNORE_PCT));
  } else {
    // 플레이어가 받는 도트 — 플레이어 방어로 차감
    const playerDef = s.playerStats.def;
    defReduce = Math.round(playerDef * 0.5 * (1 - DOT_DEF_IGNORE_PCT));
  }

  for (const dot of dots) {
    let dmg = Math.round(dot.value);
    if (dmg <= 0) continue;
    if (target === 'monster') {
      const dotAmp = getPassive(s, 'dot_amp') + getPassive(s, 'poison_amp') + getPassive(s, 'bleed_amp')
        + getPassive(s, 'burn_amp') + getPassive(s, 'holy_dot_amp')
        + getPassive(s, 'elemental_storm') // 원소 폭주 노드: 도트 데미지 증가
        + (s.equipPrefixes.dot_amp_pct || 0);
      if (dotAmp > 0) dmg = Math.round(dmg * (1 + dotAmp / 100));
      dmg = Math.max(1, dmg - defReduce);
    } else {
      const resist = getPassive(s, 'dot_resist');
      if (resist > 0) dmg = Math.round(dmg * (1 - resist / 100));
      dmg = Math.max(1, dmg - defReduce);
    }
    total += dmg;
  }
  if (total > 0) {
    if (target === 'monster') {
      s.monsterHp -= total;
      addLog(s, `[도트] 몬스터에게 ${total} 데미지 (${dots.length}중첩, 방어 50% 무시)`);
    } else {
      s.playerHp -= total;
      addLog(s, `[도트] ${total} 데미지를 받았다 (${dots.length}중첩, 방어 50% 무시)`);
    }
  }
}

// ── 스킬 실행 ──
// 마법 클래스: matk 사용 고정
const MATK_CLASSES = new Set(['mage', 'cleric']);

async function executeSkill(s: ActiveSession, skill: SkillDef): Promise<void> {
  const useMatk = MATK_CLASSES.has(s.className);

  // 쿨다운 설정
  // cooldown_reduce: 퍼센트 감소 (예: 13 → 13%)
  // mana_flow: 추가 턴 수 감소 (예: 1 → -1턴)
  if (skill.cooldown_actions > 0) {
    const cdReducePct = getPassive(s, 'cooldown_reduce');
    const cdFlat = getPassive(s, 'mana_flow');
    let cd = skill.cooldown_actions;
    if (cdReducePct > 0) cd = Math.floor(cd * (1 - cdReducePct / 100));
    if (cdFlat > 0) cd = cd - cdFlat;
    cd = Math.max(1, cd);
    s.skillCooldowns.set(skill.id, cd);
  }

  // 일일퀘 스킬 사용 트래킹
  try { trackDailyQuestProgress(s.characterId, 'use_skills', 1); } catch {}

  // 패시브: spell_amp (마법 공격 증폭), armor_pierce (방어 무시)
  const spellAmp = useMatk ? getPassive(s, 'spell_amp') : 0;
  const armorPierce = getPassive(s, 'armor_pierce');
  // 접두사: 약화(def_reduce_pct)
  const prefixDefReduce = s.equipPrefixes.def_reduce_pct || 0;

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
      const totalDefReduce = Math.min(80, armorPierce + prefixDefReduce);
      const defModStats = totalDefReduce > 0 ? {
        ...s.monsterStats,
        def: Math.round(s.monsterStats.def * (1 - totalDefReduce / 100)),
        mdef: Math.round(s.monsterStats.mdef * (1 - totalDefReduce / 100)),
      } : s.monsterStats;
      const d = calcDamage(s.playerStats, defModStats, skill.damage_mult, useMatk, skill.flat_damage, criBonus);
      if (d.miss) {
        addLog(s, `[${skill.name}] 빗나감!`);
      } else {
        let dmg = d.damage;
        // 디버프: damage_taken_up (방패 강타 등 — 적이 받는 데미지 증가)
        const dtUp = s.statusEffects.find(e => e.type === 'damage_taken_up' && e.source === 'player' && e.remainingActions > 0);
        if (dtUp) dmg = Math.round(dmg * (1 + dtUp.value / 100));
        // 패시브: spell_amp (마법 증폭)
        if (spellAmp > 0) dmg = Math.round(dmg * (1 + spellAmp / 100));
        // 패시브: judge_amp (성직자 공격 스킬 증폭) / holy_judge (신성 심판자)
        const judgeAmp = getPassive(s, 'judge_amp') + getPassive(s, 'holy_judge');
        if (judgeAmp > 0 && s.className === 'cleric') dmg = Math.round(dmg * (1 + judgeAmp / 100));
        // 접두사: 광전사 (HP 30% 이하)
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
          const critDmgBonus = getPassive(s, 'crit_damage') + (s.equipPrefixes.crit_dmg_pct || 0);
          if (critDmgBonus > 0) dmg = Math.round(dmg * (1 + critDmgBonus / 100));
          // 접두사: 재충전 (치명타 시 게이지 충전)
          const gaugeOnCrit = s.equipPrefixes.gauge_on_crit_pct || 0;
          if (gaugeOnCrit > 0) {
            s.playerGauge = Math.min(GAUGE_MAX, s.playerGauge + GAUGE_MAX * gaugeOnCrit / 100);
            addLog(s, `[재충전] 게이지 +${gaugeOnCrit}%`);
          }
        }
        s.monsterHp -= dmg;
        if (d.crit) {
          const critDmgPct = 200 + getPassive(s, 'crit_damage') + (s.equipPrefixes.crit_dmg_pct || 0);
          addLog(s, `[${skill.name}] ${dmg} 데미지! (치명타 ${critDmgPct}%)`);
        } else {
          addLog(s, `[${skill.name}] ${dmg} 데미지`);
        }

        // 접두사: 흡혈귀(lifesteal_pct)
        const prefixLifesteal = s.equipPrefixes.lifesteal_pct || 0;
        if (prefixLifesteal > 0 && dmg > 0) {
          const heal = Math.round(dmg * prefixLifesteal / 1000);
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
          const bleedDmg = Math.round(bleedBase * 0.75);
          addEffect(s, { type: 'dot', value: bleedDmg, remainingActions: 3, source: 'player' });
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
          const extra = Math.round(Math.max(0, s.monsterHp) * skill.effect_value / 100);
          s.monsterHp -= extra;
          addLog(s, `[${skill.name}] 추가 고정 ${extra} 데미지`);
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
                const critDmgBonus = getPassive(s, 'crit_damage') + (s.equipPrefixes.crit_dmg_pct || 0);
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
      }
      if (skill.effect_type === 'self_damage_pct') {
        let cost = Math.round(s.playerMaxHp * skill.effect_value / 100);
        const rageReduce = getPassive(s, 'rage_reduce');
        if (rageReduce > 0) cost = Math.round(cost * (1 - rageReduce / 100));
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
      const hitMult = chainAmp > 0 ? skill.damage_mult * (1 + chainAmp / 100) : skill.damage_mult;
      for (let i = 0; i < hits; i++) {
        const d = calcDamage(s.playerStats, s.monsterStats, hitMult, useMatk, skill.flat_damage);
        if (d.miss) {
          addLog(s, `[${skill.name}] ${i + 1}타 빗나감!`);
        } else {
          s.monsterHp -= d.damage;
          addLog(s, `[${skill.name}] ${i + 1}타 ${d.damage}${d.crit ? '!' : ''}`);
        }
      }
      break;
    }

    case 'multi_hit_poison': {
      const hits = Math.round(skill.effect_value);
      const dotBase = useMatk ? s.playerStats.matk : s.playerStats.atk;
      const dotDmg = Math.round(dotBase * 1.9);
      for (let i = 0; i < hits; i++) {
        const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk);
        if (!d.miss) {
          s.monsterHp -= d.damage;
          addLog(s, `[${skill.name}] ${i + 1}타 ${d.damage}`);
          addEffect(s, { type: 'poison', value: dotDmg, remainingActions: 3, source: 'player' });
        }
      }
      addLog(s, `[${skill.name}] 독 ${dotDmg}/행동 x3행동 (방어 50% 무시)`);
      break;
    }

    case 'dot': {
      const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk, skill.flat_damage);
      if (!d.miss) {
        s.monsterHp -= d.damage;
        addLog(s, `[${skill.name}] ${d.damage} 데미지${d.crit ? '!' : ''}`);
        const dotBase = useMatk ? s.playerStats.matk : s.playerStats.atk;
        const dotDmg = Math.round(dotBase * 1.1);
        const stormExt = getPassive(s, 'elemental_storm') > 0 ? 1 : 0; // 도트 지속 +1
        addEffect(s, { type: 'dot', value: dotDmg, remainingActions: skill.effect_duration + stormExt, source: 'player' });
        addLog(s, `[${skill.name}] 도트 ${dotDmg}/행동 x${skill.effect_duration + stormExt}행동 (방어 50% 무시)`);
      } else {
        addLog(s, `[${skill.name}] 빗나감!`);
      }
      break;
    }

    case 'poison': {
      const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk, skill.flat_damage);
      if (!d.miss) {
        s.monsterHp -= d.damage;
        addLog(s, `[${skill.name}] ${d.damage} 데미지`);
      }
      const dotBase = useMatk ? s.playerStats.matk : s.playerStats.atk;
      const dotDmg = Math.round(dotBase * 1.9);
      addEffect(s, { type: 'poison', value: dotDmg, remainingActions: skill.effect_duration, source: 'player' });
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
      if (totalBurst > 0) {
        s.monsterHp -= totalBurst;
        addLog(s, `[${skill.name}] 독 폭발! ${totalBurst} 데미지 (독 유지)`);
        // 독 스택은 유지 — 폭발 후에도 도트 데미지 계속 적용
      } else {
        addLog(s, `[${skill.name}] 독이 없어 효과 없음`);
      }
      break;
    }

    case 'speed_mod':
    case 'self_speed_mod': {
      if (skill.damage_mult > 0) {
        const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk, skill.flat_damage);
        if (!d.miss) {
          s.monsterHp -= d.damage;
          addLog(s, `[${skill.name}] ${d.damage} 데미지${d.crit ? '!' : ''}`);
        }
      }
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
      s.monsterGauge = 0;
      const gcAmp = getPassive(s, 'gauge_control_amp');
      const stunChance = skill.effect_value * (1 + gcAmp / 100);
      addLog(s, `[${skill.name}] 적 게이지 리셋!`);
      if (Math.random() * 100 < stunChance) {
        if (hasEffect(s, 'player', 'cc_immune')) {
          addLog(s, `[${skill.name}] 몬스터 상태이상 면역!`);
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
        s.monsterHp -= d.damage;
        addLog(s, `[${skill.name}] ${d.damage} 데미지${d.crit ? '!' : ''}`);
        if (hasEffect(s, 'player', 'cc_immune')) {
          addLog(s, `[${skill.name}] 몬스터 상태이상 면역!`);
        } else if (Math.random() < 0.5) {
          addLog(s, `[${skill.name}] 몬스터가 기절에 저항!`);
        } else {
          const stunExt = getPassive(s, 'stun_extend');
          const stunDur = skill.effect_duration + stunExt;
          addEffect(s, { type: 'stun', value: 0, remainingActions: stunDur, source: 'player' });
          addEffect(s, { type: 'cc_immune', value: 0, remainingActions: stunDur + 3, source: 'player' });
          addLog(s, `[${skill.name}] 스턴 ${stunDur}행동!`);
        }
        // 방패 강타: 적이 받는 데미지 20% 증가 3턴 (effect_value로 퍼센트 전달)
        if (skill.name === '방패 강타') {
          addEffect(s, { type: 'damage_taken_up', value: 20, remainingActions: 3, source: 'player' });
          addLog(s, `[${skill.name}] 적 받는 데미지 +20% 3턴!`);
        }
      } else {
        addLog(s, `[${skill.name}] 빗나감!`);
      }
      break;
    }

    case 'gauge_freeze': {
      if (hasEffect(s, 'player', 'cc_immune')) {
        addLog(s, `[${skill.name}] 몬스터 상태이상 면역!`);
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
      break;
    }

    case 'accuracy_debuff': {
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
      break;
    }

    case 'damage_reduce': {
      addEffect(s, { type: 'damage_reduce', value: skill.effect_value, remainingActions: skill.effect_duration, source: 'monster' }); // protects player
      addLog(s, `[${skill.name}] 받는 데미지 ${skill.effect_value}% 감소!`);
      break;
    }

    case 'damage_reflect': {
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
      // 공격 + 보호막 (damage_mult > 0이면 데미지도 처리)
      if (skill.damage_mult > 0) {
        const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk, skill.flat_damage);
        if (!d.miss) {
          let dmg = d.damage;
          if (spellAmp > 0) dmg = Math.round(dmg * (1 + spellAmp / 100));
          s.monsterHp -= dmg;
          addLog(s, `[${skill.name}] ${dmg} 데미지${d.crit ? '!' : ''}`);
        }
      }
      let shieldHp = Math.round(s.playerMaxHp * skill.effect_value / 100);
      const shieldAmp = getPassive(s, 'shield_amp');
      if (shieldAmp > 0) shieldHp = Math.round(shieldHp * (1 + shieldAmp / 100));
      addEffect(s, { type: 'shield', value: shieldHp, remainingActions: skill.effect_duration || 3, source: 'monster' });
      addLog(s, `[${skill.name}] 실드 ${shieldHp}!`);
      break;
    }

    case 'shield_break': {
      // 심판의 철퇴 등 — 더 이상 자신의 쉴드를 파괴하지 않음
      // 대신 현재 쉴드량의 200%를 추가 데미지로 변환 (쉴드는 그대로 유지)
      const myShield = s.statusEffects.find(e => e.type === 'shield' && e.source === 'monster' && e.value > 0);
      const shieldBonus = myShield ? Math.round(myShield.value * 2.0) : 0;
      const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk, skill.flat_damage);
      if (!d.miss) {
        let dmg = d.damage + shieldBonus;
        const parts: string[] = [];
        if (shieldBonus > 0) parts.push(`실드 비례 +${shieldBonus}`);
        // effect_value > 0 → 내 maxHp의 X% 추가 데미지 (심판의 철퇴 등)
        if (skill.effect_value > 0) {
          const hpBonus = Math.round(s.playerMaxHp * skill.effect_value / 100);
          dmg += hpBonus;
          parts.push(`HP ${skill.effect_value}% +${hpBonus}`);
        }
        s.monsterHp -= dmg;
        const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';
        addLog(s, `[${skill.name}] ${dmg} 데미지${d.crit ? '!' : ''}${suffix}`);
      } else {
        addLog(s, `[${skill.name}] 빗나감!`);
      }
      break;
    }

    case 'holy_strike': {
      // 신성 타격 — 기본 데미지 + 방어력 비례 추가 데미지
      const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk, skill.flat_damage);
      if (!d.miss) {
        const defBonus = Math.round(s.playerStats.def * (skill.effect_value || 100) / 100);
        const total = d.damage + defBonus;
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
        s.monsterHp -= d.damage;
        addLog(s, `[${skill.name}] 실드 파괴 + ${d.damage} 데미지${d.crit ? '!' : ''}`);
      }
      const buffPct = skill.effect_value || 50;
      const buffDur = skill.effect_duration || 3;
      addEffect(s, { type: 'def_buff', value: buffPct, remainingActions: buffDur, source: 'monster' });
      addLog(s, `[${skill.name}] 방어력 +${buffPct}% ${buffDur}턴!`);
      break;
    }

    case 'heal_pct': {
      let heal = Math.round(s.playerMaxHp * skill.effect_value / 100);
      const healAmp = getPassive(s, 'heal_amp');
      if (healAmp > 0) heal = Math.round(heal * (1 + healAmp / 100));
      s.playerHp = Math.min(s.playerMaxHp, s.playerHp + heal);
      addLog(s, `[${skill.name}] HP +${heal} 회복!`);
      break;
    }

    case 'resurrect': {
      addEffect(s, { type: 'resurrect', value: skill.effect_value, remainingActions: 999, source: 'monster' });
      addLog(s, `[${skill.name}] 부활 준비!`);
      break;
    }

    default:
      addLog(s, `[${skill.name}] 사용!`);
  }
}

// ── 자동 행동 AI ──

// 쿨다운이 끝난 사용 가능한 스킬인지 체크
function isSkillReady(s: ActiveSession, sk: SkillDef): boolean {
  if (sk.cooldown_actions === 0) return true;
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

async function autoAction(s: ActiveSession): Promise<void> {
  const hpPct = s.playerHp / s.playerMaxHp;

  // ── 0. 힐 스킬은 HP 80% 미만에서 쿨 풀리면 항상 사용 (포션 설정과 별개) ──
  if (hpPct < 0.8) {
    const healSkill = findReady(s, 'heal_pct');
    if (healSkill) { await executeSkill(s, healSkill); return; }
  }

  // ── 1. HP 위험 (임계값 이하) → 포션 / 무적 / 부활 ──
  const healThresholdPct = s.autoPotionThreshold || 50;
  if (hpPct * 100 < healThresholdPct) {
    // 포션 (자동 포션 ON일 때만)
    if (s.autoPotionEnabled && s.potionCooldown <= 0) {
      const potionHealPct: Record<number, number> = { 106: 80, 104: 60, 102: 40, 100: 20 };
      const pot = await getPotionInInventory(s.characterId, [106, 104, 102, 100]);
      if (pot) {
        const pct = potionHealPct[pot.item_id] || 20;
        const heal = Math.round(s.playerMaxHp * pct / 100);
        s.playerHp = Math.min(s.playerMaxHp, s.playerHp + heal);
        await consumeOneFromSlot(pot.id);
        s.potionCooldown = 3;
        addLog(s, `체력 물약 사용 — HP +${heal} (${pct}%) [쿨타임 3턴]`);
        return;
      }
    }
    // 무적 (HP 20% 이하)
    if (hpPct < 0.2) {
      const invSkill = findReady(s, 'invincible');
      if (invSkill && !hasActivePlayerBuff(s, 'invincible')) { await executeSkill(s, invSkill); return; }
    }
    // 부활 준비 (HP 25% 이하, 아직 부활 버프 없으면)
    if (hpPct < 0.25) {
      const resSkill = findReady(s, 'resurrect');
      if (resSkill && !hasActivePlayerBuff(s, 'resurrect')) { await executeSkill(s, resSkill); return; }
    }
  }

  // ── 1.5. 실드는 쿨다운 풀리는 즉시 항상 유지 (HP 무관) ──
  if (!hasActivePlayerBuff(s, 'shield')) {
    const shieldSkill = findReady(s, 'shield');
    if (shieldSkill && shieldSkill.damage_mult === 0) { await executeSkill(s, shieldSkill); return; }
  }

  // ── 2. HP 60% 이하 → 방어 버프 (중복 방지) ──
  if (hpPct < 0.6) {
    // 데미지 감소
    if (!hasActivePlayerBuff(s, 'damage_reduce')) {
      const drSkill = findReady(s, 'damage_reduce');
      if (drSkill) { await executeSkill(s, drSkill); return; }
    }
    // 데미지 반사
    if (!hasActivePlayerBuff(s, 'damage_reflect')) {
      const reflSkill = findReady(s, 'damage_reflect');
      if (reflSkill && reflSkill.damage_mult === 0) { await executeSkill(s, reflSkill); return; }
    }
  }

  // ── 3. 유틸 디버프 (활성 효과 없을 때만) ──
  if (!hasEffect(s, 'player', 'gauge_freeze')) {
    const freezeSkill = findReady(s, 'gauge_freeze');
    if (freezeSkill) { await executeSkill(s, freezeSkill); return; }
  }
  if (!hasEffect(s, 'player', 'accuracy_debuff')) {
    const accSkill = findReady(s, 'accuracy_debuff');
    if (accSkill) { await executeSkill(s, accSkill); return; }
  }
  // 게이지 리셋 (쿨 돌면 바로)
  const grSkill = findReady(s, 'gauge_reset');
  if (grSkill) { await executeSkill(s, grSkill); return; }

  // ── 4. 자가 버프 (중복 방지) ──
  if (!hasActivePlayerBuff(s, 'speed_mod')) {
    const spdSkill = s.skills.find(sk => sk.effect_type === 'self_speed_mod' && sk.effect_value > 0 && isSkillReady(s, sk));
    if (spdSkill) { await executeSkill(s, spdSkill); return; }
  }
  // 게이지 충전
  const gfSkill = findReady(s, 'gauge_fill');
  if (gfSkill) { await executeSkill(s, gfSkill); return; }

  // ── 5. 독 폭발 (독 2중첩 이상일 때) ──
  const poisonCount = s.statusEffects.filter(e => e.type === 'poison' && e.source === 'player').length;
  if (poisonCount >= 2) {
    const burstSkill = findReady(s, 'poison_burst');
    if (burstSkill) { await executeSkill(s, burstSkill); return; }
  }

  // ── 6. 공격 스킬 (damage_mult 높은 순) ──
  const attackSkills = s.skills
    .filter(sk => sk.damage_mult > 0 && sk.cooldown_actions > 0 && isSkillReady(s, sk))
    .sort((a, b) => b.damage_mult - a.damage_mult);
  if (attackSkills.length > 0) {
    await executeSkill(s, attackSkills[0]);
    return;
  }

  // ── 7. 기본기 ──
  const basic = s.skills
    .filter(sk => sk.cooldown_actions === 0 && isSkillReady(s, sk))
    .sort((a, b) => b.damage_mult - a.damage_mult)[0];
  if (basic) {
    await executeSkill(s, basic);
    return;
  }

  // fallback
  const d = calcDamage(s.playerStats, s.monsterStats, 1.0, MATK_CLASSES.has(s.className));
  if (d.miss) addLog(s, '기본 공격 빗나감!');
  else {
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

  const d = calcDamage(s.monsterStats, playerDefStats, 1.0, false);

  // 명중률 디버프
  const accDebuff = s.statusEffects.find(e => e.type === 'accuracy_debuff' && e.source === 'player');
  if (accDebuff && Math.random() * 100 < accDebuff.value) {
    addLog(s, '몬스터 공격 빗나감! (연막)');
    return;
  }

  if (d.miss) {
    addLog(s, '몬스터 공격 빗나감!');
  } else {
    let dmg = d.damage;

    // 무적 체크
    if (hasEffect(s, 'monster', 'invincible')) {
      addLog(s, `무적! 데미지 무효화`);
      return;
    }

    // 실드 체크
    const shield = s.statusEffects.find(e => e.type === 'shield' && e.source === 'monster');
    if (shield && shield.value > 0) {
      if (shield.value >= dmg) {
        shield.value -= dmg;
        addLog(s, `실드가 ${dmg} 흡수 (잔여: ${shield.value})`);
        dmg = 0;
      } else {
        dmg -= shield.value;
        addLog(s, `실드 파괴! 잔여 ${dmg} 데미지`);
        shield.value = 0;
        shield.remainingActions = 0;
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
    if (guardianProc) addLog(s, `[수호자] 받는 데미지 -${guardian}%`);

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
  const mr = await query<MonsterDef>(
    'SELECT id, name, level, max_hp, exp_reward, gold_reward, drop_table, stats FROM monsters WHERE id = $1',
    [s.monsterId]
  );
  const m = mr.rows[0];
  if (!m) return;

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

  // 접두사 + 프리미엄 부스터
  const charBoost = await query<{ gold_boost_until: string | null; drop_boost_until: string | null }>(
    'SELECT gold_boost_until, drop_boost_until FROM characters WHERE id = $1', [s.characterId]
  );
  const goldBonusPct = s.equipPrefixes.gold_bonus_pct || 0;
  const expBonusPct = s.equipPrefixes.exp_bonus_pct || 0;
  const goldBoostActive = charBoost.rows[0]?.gold_boost_until && new Date(charBoost.rows[0].gold_boost_until) > new Date();
  const dropBoostActive = charBoost.rows[0]?.drop_boost_until && new Date(charBoost.rows[0].drop_boost_until) > new Date();
  // 길드 스킬 버프
  const guildSkills = await getGuildSkillsForCharacter(s.characterId);
  const guildGoldBonus = guildSkills.gold * GUILD_SKILL_PCT.gold;
  const guildExpBonus = guildSkills.exp * GUILD_SKILL_PCT.exp;
  const guildDropBonus = guildSkills.drop * GUILD_SKILL_PCT.drop;
  // 영토 점령 보너스 (점령 길드원 한정)
  // 영토 점령전 일시 비활성 — 보너스 0
  const territoryBonus = { expPct: 0, dropPct: 0 };
  // const territoryBonus = await getTerritoryBonusForChar(s.characterId, s.fieldId);
  const finalGold = Math.floor(m.gold_reward * (1 + goldBonusPct / 100) * (1 + guildGoldBonus / 100) * (goldBoostActive ? 1.5 : 1.0));

  addLog(s, `${m.name}을(를) 처치! +${m.exp_reward}exp, +${finalGold}G`);

  // 일일퀘 + 업적 트래킹
  try {
    await trackDailyQuestProgress(s.characterId, 'kill_monsters', 1);
    await query('UPDATE characters SET total_kills = total_kills + 1, total_gold_earned = total_gold_earned + $1 WHERE id = $2', [finalGold, s.characterId]);
    await checkAndUnlockAchievements(s.characterId);
  } catch {}

  const char = await loadCharacter(s.characterId);
  if (!char) return;

  // 부스터 + 접두사 + 길드 + 영토 경험 보너스
  const boostActive = char.exp_boost_until && new Date(char.exp_boost_until) > new Date();
  const boostedExp = Math.floor(m.exp_reward * (boostActive ? 1.5 : 1.0) * (1 + expBonusPct / 100) * (1 + guildExpBonus / 100) * (1 + territoryBonus.expPct / 100));
  const result = applyExpGain(char.level, char.exp, boostedExp, char.class_name);
  // 길드 EXP 5% 기여 (비동기 fire-and-forget)
  contributeGuildExp(s.characterId, boostedExp).catch(() => {});
  // 영토 점수 +1 (사냥 처치 횟수 누적)
  // 영토 점령전 일시 비활성 — 점수 적립 중단
  // addTerritoryScore(s.characterId, s.fieldId).catch(() => {});

  if (result.levelsGained > 0) {
    addLog(s, `레벨업! Lv.${result.newLevel} (스탯포인트 +${result.statPointsGained})`);
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
    s.playerStats = await getEffectiveStats(updatedChar || { ...char, level: result.newLevel, max_hp: char.max_hp + result.hpGained } as any);
    s.playerMaxHp = s.playerStats.maxHp;
    s.playerHp = s.playerMaxHp; // 레벨업 시 풀회복
    s.playerSpeed = s.playerStats.spd;
    // 새 스킬 학습
    s.skills = await getCharSkills(s.characterId, char.class_name, result.newLevel);
  } else {
    await query('UPDATE characters SET exp=$1, gold=gold+$2 WHERE id=$3',
      [result.newExp, finalGold, s.characterId]);
  }

  await trackMonsterKill(s.characterId, s.monsterId!);

  let drops = rollDrops(m, !!dropBoostActive, guildDropBonus + territoryBonus.dropPct);
  // 자동분해 설정 체크
  const autoDismantleR = await query<{ auto_dismantle_common: boolean }>(
    'SELECT COALESCE(auto_dismantle_common, FALSE) AS auto_dismantle_common FROM characters WHERE id = $1',
    [s.characterId]
  );
  const autoDismantle = autoDismantleR.rows[0]?.auto_dismantle_common ?? false;

  for (const drop of drops) {
    // 자동분해: 일반 등급 장비 → 골드 변환
    if (autoDismantle) {
      const itemCheck = await query<{ grade: string; slot: string | null; sell_price: number; name: string }>(
        'SELECT grade, slot, sell_price, name FROM items WHERE id = $1', [drop.itemId]
      );
      if (itemCheck.rows[0] && itemCheck.rows[0].grade === 'common' && itemCheck.rows[0].slot) {
        const gold = Math.max(1, Math.floor(itemCheck.rows[0].sell_price * 0.5));
        await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [gold, s.characterId]);
        addLog(s, `${itemCheck.rows[0].name} 자동분해 → +${gold}G`);
        continue;
      }
    }

    const { overflow } = await addItemToInventory(s.characterId, drop.itemId, drop.qty);
    if (overflow > 0) {
      await deliverToMailbox(s.characterId, '가방 초과분', '가방이 가득 차서 우편으로 배송되었습니다.', drop.itemId, overflow);
    }
    addLog(s, '아이템 획득!');
  }

  // 다음 몬스터 스폰
  await spawnMonsterForSession(s);
}

async function spawnMonsterForSession(s: ActiveSession): Promise<void> {
  const m = await pickRandomMonster(s.fieldId);
  if (!m) {
    s.monsterId = null;
    return;
  }
  s.monsterId = m.id;
  s.monsterName = m.name;
  s.monsterLevel = m.level;
  s.monsterHp = m.max_hp;
  s.monsterMaxHp = m.max_hp;
  s.monsterStats = monsterToEffective(m);
  s.monsterSpeed = s.monsterStats.spd;
  s.monsterGauge = 0;
  s.hasFirstStrike = true; // 새 몬스터 → 첫 공격 보너스 다시
  // 몬스터 관련 디버프 초기화
  s.statusEffects = s.statusEffects.filter(e => e.source === 'monster');
  addLog(s, `${m.name}이(가) 나타났다!`);
}

// ── 플레이어 사망 ──
async function handlePlayerDeath(s: ActiveSession): Promise<void> {
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
  // 사망 시 마을 복귀 + HP 100% 회복
  await query(
    'UPDATE characters SET hp=max_hp, location=$1, last_online_at=NOW() WHERE id=$2',
    ['village', s.characterId]
  );
  await query('DELETE FROM combat_sessions WHERE character_id=$1', [s.characterId]);

  // 최종 상태 push (HP 0으로 사망 표시)
  pushCombatState(s, true);
  activeSessions.delete(s.characterId);
}

// ── 메인 틱 루프 ──
async function combatTick(): Promise<void> {
  for (const [charId, s] of activeSessions) {
    try {
      if (!s.monsterId) continue;

      // 각성 카운터: 매 틱마다 +1 (피격 시 0으로 리셋)
      s.ticksSinceLastHit++;

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

      // 접두사: 재생(hp_regen) → 틱당 HP 회복
      if (s.equipPrefixes.hp_regen && s.playerHp < s.playerMaxHp && s.playerHp > 0) {
        s.playerHp = Math.min(s.playerMaxHp, s.playerHp + Math.round(s.equipPrefixes.hp_regen / 10)); // 100ms당 1/10
        s.dirty = true;
      }

      // 게이지 충전 (GAUGE_FILL_RATE로 스케일링)
      if (!s.waitingInput) {
        s.playerGauge += effectivePlayerSpeed * GAUGE_FILL_RATE;
      }

      // 몬스터 게이지 충전 (동결/기절은 monsterAction에서 체크하며 tickDown)
      s.monsterGauge += effectiveMonsterSpeed * GAUGE_FILL_RATE;

      // 몬스터 행동
      if (s.monsterGauge >= GAUGE_MAX) {
        monsterAction(s);
        s.monsterGauge = 0;
        // 도트 먼저 적용 → 그 다음 카운트 감소 (마지막 1틱 보존)
        processDots(s, 'monster');
        tickDownEffects(s, 'player');
        s.dirty = true;

        if (s.playerHp <= 0) {
          await handlePlayerDeath(s);
          continue;
        }
        // 도트로 몬스터 처치된 경우 즉시 처리
        if (s.monsterHp <= 0) {
          await handleMonsterDeath(s);
        }
      }

      // 플레이어 행동
      if (s.playerGauge >= GAUGE_MAX) {
        if (s.autoMode) {
          s.playerGauge = 0;
          s.actionCount++;

          // 쿨다운 감소
          for (const [skId, cd] of s.skillCooldowns) {
            if (cd > 0) s.skillCooldowns.set(skId, cd - 1);
            if (cd <= 1) s.skillCooldowns.delete(skId);
          }
          if (s.potionCooldown > 0) s.potionCooldown--;

          await autoAction(s);
          // 도트 먼저 적용 → 그 다음 카운트 감소
          processDots(s, 'player');
          tickDownEffects(s, 'monster');
          s.dirty = true;

          // 몬스터 처치 체크
          if (s.monsterHp <= 0) {
            await handleMonsterDeath(s);
          }
          // 플레이어 사망 체크
          if (s.playerHp <= 0) {
            await handlePlayerDeath(s);
            continue;
          }
        } else {
          // 수동 모드: 입력 대기
          if (!s.waitingInput) {
            s.waitingInput = true;
            s.waitingSince = Date.now();
            s.playerGauge = GAUGE_MAX;
            s.dirty = true;
          }
        }
      }

      // 상태 push (dirty일 때만)
      if (s.dirty) {
        pushCombatState(s, true);
        s.dirty = false;
      }
    } catch (err) {
      console.error(`[combat] tick error for char ${charId}:`, err);
    }
  }
}

// ── WebSocket Push ──
async function pushCombatState(s: ActiveSession, inCombat: boolean): Promise<void> {
  const io = getIo();
  if (!io) return;

  // exp 정보 로드
  let exp = 0, expMax = 1;
  try {
    const charR = await query<{ level: number; exp: string }>('SELECT level, exp FROM characters WHERE id = $1', [s.characterId]);
    if (charR.rows[0]) {
      const lv = charR.rows[0].level;
      exp = Number(charR.rows[0].exp);
      expMax = expToNext(lv);
    }
  } catch {}

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
    })),
    log: s.log,
    autoPotion: { enabled: s.autoPotionEnabled, threshold: s.autoPotionThreshold },
    exp,
    expMax,
    serverTime: Date.now(),
  };

  // 부스트 정보
  try {
    const br = await query<{ exp_boost_until: string | null; gold_boost_until: string | null; drop_boost_until: string | null }>(
      'SELECT exp_boost_until, gold_boost_until, drop_boost_until FROM characters WHERE id = $1', [s.characterId]
    );
    const now = new Date();
    const b = br.rows[0];
    const boosts: { name: string; until: string }[] = [];
    if (b?.exp_boost_until && new Date(b.exp_boost_until) > now)
      boosts.push({ name: 'EXP 부스터 +50%', until: b.exp_boost_until });
    if (b?.gold_boost_until && new Date(b.gold_boost_until) > now)
      boosts.push({ name: '골드 +50%', until: b.gold_boost_until });
    if (b?.drop_boost_until && new Date(b.drop_boost_until) > now)
      boosts.push({ name: '드롭률 +50%', until: b.drop_boost_until });
    snapshot.boosts = boosts;
  } catch {}

  // 보유 물약 수량 (HP 물약 4종)
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
    snapshot.potions = { small: map[100], mid: map[102], high: map[104], max: map[106] };
  } catch {}

  // 길드 버프 정보
  try {
    const gskills = await getGuildSkillsForCharacter(s.characterId);
    snapshot.guildBuffs = {
      hp: gskills.hp * GUILD_SKILL_PCT.hp,
      gold: gskills.gold * GUILD_SKILL_PCT.gold,
      exp: gskills.exp * GUILD_SKILL_PCT.exp,
      drop: gskills.drop * GUILD_SKILL_PCT.drop,
    };
  } catch {}

  // 영토 점령 보너스 정보
  try {
    snapshot.territoryBuffs = { expPct: 0, dropPct: 0 }; // 일시 비활성
    // snapshot.territoryBuffs = await getTerritoryBonusForChar(s.characterId, s.fieldId);
  } catch {}

  // 해당 유저의 소켓에만 emit
  io.emit(`combat:${s.characterId}`, snapshot);
}

// ── 공개 API ──

export async function startCombatSession(characterId: number, fieldId: number): Promise<void> {
  // 기존 세션 정리
  activeSessions.delete(characterId);

  const char = await loadCharacter(characterId);
  if (!char) throw new Error('character not found');

  const fr = await query<{ name: string }>('SELECT name FROM fields WHERE id = $1', [fieldId]);
  const fieldName = fr.rows[0]?.name || '알 수 없는 필드';

  const eff = await getEffectiveStats(char);
  const skills = await getCharSkills(characterId, char.class_name, char.level);
  const passives = await getNodePassives(characterId);
  const equipPrefixes = await loadEquipPrefixes(characterId);

  // 키스톤 패시브 적용: 전투 시작 시 스탯 수정
  const pMap = new Map(passives.map(p => [p.key, p.value]));
  // war_god: 공격력 +N%
  if (pMap.has('war_god')) { eff.atk = Math.round(eff.atk * (1 + (pMap.get('war_god')! / 100))); }
  // shadow_dance: 회피 +N
  if (pMap.has('shadow_dance')) { eff.dodge += pMap.get('shadow_dance')!; }
  // trickster: 치명타 +N
  if (pMap.has('trickster')) { eff.cri += pMap.get('trickster')!; }
  // iron_will: 방어 +N%
  if (pMap.has('iron_will')) { eff.def = Math.round(eff.def * (1 + (pMap.get('iron_will')! / 100))); }
  // mana_overload: 마법공격 +N% (mana_flow는 쿨다운 추가 감소로 사용 — executeSkill에서 처리)
  const matkBonus = pMap.get('mana_overload') || 0;
  if (matkBonus > 0) { eff.matk = Math.round(eff.matk * (1 + matkBonus / 100)); }
  // focus_mastery: 명중 +N
  if (pMap.has('focus_mastery')) { eff.accuracy += pMap.get('focus_mastery')!; }
  // berserker_heart: 공격 +N% 방어 -N%
  if (pMap.has('berserker_heart')) {
    const v = pMap.get('berserker_heart')!;
    eff.atk = Math.round(eff.atk * (1 + v / 100));
    eff.def = Math.round(eff.def * (1 - v / 200)); // 절반만 감소
  }
  // elemental_storm: 도트 데미지 대폭 증가 (dot_amp처럼 작동하지만 별도)
  // time_lord: 스피드 +N%
  if (pMap.has('time_lord')) { eff.spd = Math.round(eff.spd * (1 + (pMap.get('time_lord')! / 100))); }
  // counter_incarnation: 반사 데미지 상시 적용
  // sanctuary_guard: 최대HP +N%
  if (pMap.has('sanctuary_guard')) {
    const bonus = Math.round(char.max_hp * pMap.get('sanctuary_guard')! / 100);
    eff.maxHp += bonus;
  }
  // balance_apostle: 모든 스탯 소폭 증가
  if (pMap.has('balance_apostle')) {
    const v = pMap.get('balance_apostle')!;
    eff.atk = Math.round(eff.atk * (1 + v / 100));
    eff.matk = Math.round(eff.matk * (1 + v / 100));
    eff.def = Math.round(eff.def * (1 + v / 100));
  }
  // poison_lord: 독 도트 기본 적용 (전투 시작 시 독 연장)
  // holy_judge: 신성 데미지 추가 (spell_amp처럼 작동)

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
  };

  // 패시브: counter_incarnation (상시 반사)
  const counterInc = pMap.get('counter_incarnation') || 0;
  if (counterInc > 0) {
    session.statusEffects.push({ id: 'counter_inc', type: 'damage_reflect', value: counterInc, remainingActions: 99999, source: 'monster' });
  }

  // DB 세션
  await query('DELETE FROM combat_sessions WHERE character_id = $1', [characterId]);
  await query(
    `INSERT INTO combat_sessions
     (character_id, field_id, player_hp, player_gauge, player_speed, auto_mode)
     VALUES ($1, $2, $3, 0, $4, TRUE)`,
    [characterId, fieldId, char.hp, eff.spd]
  );
  await query('UPDATE characters SET location = $1, last_online_at = NOW() WHERE id = $2',
    [`field:${fieldId}`, characterId]);

  await spawnMonsterForSession(session);
  activeSessions.set(characterId, session);

  // 전투 루프 시작 (아직 안 돌고 있으면)
  ensureCombatLoop();
}

export async function stopCombatSession(characterId: number): Promise<void> {
  const s = activeSessions.get(characterId);
  if (s) {
    // 현재 HP 저장
    await query('UPDATE characters SET hp=$1, location=$2, last_online_at=NOW() WHERE id=$3',
      [Math.max(1, s.playerHp), 'village', characterId]);
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

export async function manualSkillUse(characterId: number, skillId: number): Promise<boolean> {
  const s = activeSessions.get(characterId);
  if (!s || !s.waitingInput) return false;

  const skill = s.skills.find(sk => sk.id === skillId);
  if (!skill) return false;

  const cd = s.skillCooldowns.get(skillId);
  if (cd && cd > 0) return false;

  s.waitingInput = false;
  s.playerGauge = 0;
  s.actionCount++;

  // 쿨다운 감소
  for (const [skId, cdVal] of s.skillCooldowns) {
    if (cdVal > 0) s.skillCooldowns.set(skId, cdVal - 1);
    if (cdVal <= 1) s.skillCooldowns.delete(skId);
  }

  await executeSkill(s, skill);
  processDots(s, 'player');
  tickDownEffects(s, 'monster');
  s.dirty = true;

  if (s.monsterHp <= 0) await handleMonsterDeath(s);
  if (s.playerHp <= 0) await handlePlayerDeath(s);

  return true;
}

export async function getCombatSnapshot(characterId: number): Promise<CombatSnapshot | null> {
  const s = activeSessions.get(characterId);
  if (!s) return null;

  let exp = 0, expMax = 1;
  try {
    const charR = await query<{ level: number; exp: string }>('SELECT level, exp FROM characters WHERE id = $1', [characterId]);
    if (charR.rows[0]) {
      exp = Number(charR.rows[0].exp);
      expMax = expToNext(charR.rows[0].level);
    }
  } catch {}

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
    })),
    log: s.log,
    autoPotion: { enabled: s.autoPotionEnabled, threshold: s.autoPotionThreshold },
    exp,
    expMax,
    serverTime: Date.now(),
  };
}

export function isInCombat(characterId: number): boolean {
  return activeSessions.has(characterId);
}

// 장비/노드 변경 시 인메모리 세션 스탯 갱신
export async function refreshSessionStats(characterId: number): Promise<void> {
  const s = activeSessions.get(characterId);
  if (!s) return;
  const char = await loadCharacter(characterId);
  if (!char) return;
  const eff = await getEffectiveStats(char);
  s.playerStats = eff;
  s.playerMaxHp = eff.maxHp;
  s.playerSpeed = eff.spd;
  s.equipPrefixes = await loadEquipPrefixes(characterId);
  s.passives = await getNodePassives(characterId); // 노드 패시브 재로드
  s.dirty = true;
}

export function getCombatHp(characterId: number): number | null {
  const s = activeSessions.get(characterId);
  return s ? Math.max(0, s.playerHp) : null;
}

function ensureCombatLoop() {
  if (combatInterval) return;
  combatInterval = setInterval(() => {
    combatTick().catch(err => console.error('[combat] loop error:', err));
  }, 100); // 100ms 틱
  console.log('[combat] engine started (100ms tick)');
}

// 서버 시작 시 기존 DB 세션 복구
export async function restoreCombatSessions(): Promise<void> {
  const r = await query<{ character_id: number; field_id: number; player_hp: number; player_speed: number; auto_mode: boolean }>(
    'SELECT character_id, field_id, player_hp, player_speed, auto_mode FROM combat_sessions'
  );
  for (const row of r.rows) {
    try {
      await startCombatSession(row.character_id, row.field_id);
    } catch (e) {
      console.error(`[combat] restore failed for char ${row.character_id}:`, e);
    }
  }
  if (r.rowCount && r.rowCount > 0) {
    console.log(`[combat] restored ${r.rowCount} sessions`);
  }
}
