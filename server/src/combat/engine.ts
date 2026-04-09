// v0.9 게이지 기반 전투 엔진
import { query } from '../db/pool.js';
import { calcDamage, type EffectiveStats } from '../game/formulas.js';
import { applyExpGain } from '../game/leveling.js';
import { loadCharacter, getEffectiveStats, getNodePassives } from '../game/character.js';
import { addItemToInventory, deliverToMailbox } from '../game/inventory.js';
import { expToNext } from '../game/leveling.js';
import { trackMonsterKill } from '../routes/quests.js';
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
  potions?: { hpSmall: number; hpMid: number };
  autoPotion: { enabled: boolean; threshold: number };
  exp?: number;
  expMax?: number;
  serverTime: number;
}
import { getIo } from '../ws/io.js';

const GAUGE_MAX = 1000;
const MAX_LOG = 30;
// 100ms 틱에서 speed를 이 비율로 충전 (0.2 = speed 300일 때 ~1.7초 행동주기)
const GAUGE_FILL_RATE = 0.2;

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
    const mult = 1 + el * 0.08;
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

  // 전투에 가져갈 스킬: auto_use=true인 것만, 최대 6개
  const r = await query<SkillDef>(
    `SELECT s.id, s.name, s.damage_mult, s.kind, s.cooldown_actions, s.flat_damage,
            s.effect_type, s.effect_value, s.effect_duration, s.required_level
     FROM skills s
     JOIN character_skills cs ON cs.skill_id = s.id AND cs.character_id = $3
     WHERE s.class_name = $1 AND s.required_level <= $2 AND cs.auto_use = TRUE
     ORDER BY s.required_level ASC
     LIMIT $4`,
    [className, level, characterId, MAX_COMBAT_SKILLS]
  );
  return r.rows;
}

// 드롭률 배율: 기본 x0.1 (대폭 하향), 온라인 보너스 +50%
const DROP_RATE_MULT = 0.1;
const ONLINE_DROP_BONUS = 1.5;

function rollDrops(m: MonsterDef): { itemId: number; qty: number }[] {
  const drops: { itemId: number; qty: number }[] = [];
  for (const d of m.drop_table || []) {
    if (Math.random() < d.chance * DROP_RATE_MULT * ONLINE_DROP_BONUS) {
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
function processDots(s: ActiveSession, target: 'player' | 'monster') {
  const dots = s.statusEffects.filter(e =>
    (e.type === 'dot' || e.type === 'poison') &&
    ((target === 'monster' && e.source === 'player') || (target === 'player' && e.source === 'monster')) &&
    e.remainingActions > 0
  );
  if (dots.length === 0) return;
  let total = 0;
  for (const dot of dots) {
    let dmg = Math.round(dot.value);
    if (dmg <= 0) continue;
    if (target === 'monster') {
      const dotAmp = getPassive(s, 'dot_amp') + getPassive(s, 'poison_amp') + getPassive(s, 'bleed_amp')
        + getPassive(s, 'burn_amp') + getPassive(s, 'holy_dot_amp') + (s.equipPrefixes.dot_amp_pct || 0);
      if (dotAmp > 0) dmg = Math.round(dmg * (1 + dotAmp / 100));
    } else {
      const resist = getPassive(s, 'dot_resist');
      if (resist > 0) dmg = Math.round(dmg * (1 - resist / 100));
    }
    total += dmg;
  }
  if (total > 0) {
    if (target === 'monster') {
      s.monsterHp -= total;
      addLog(s, `[도트] 몬스터에게 ${total} 데미지 (${dots.length}중첩)`);
    } else {
      s.playerHp -= total;
      addLog(s, `[도트] ${total} 데미지를 받았다 (${dots.length}중첩)`);
    }
  }
}

// ── 스킬 실행 ──
// 마법 클래스: matk 사용 고정
const MATK_CLASSES = new Set(['mage', 'cleric']);

async function executeSkill(s: ActiveSession, skill: SkillDef): Promise<void> {
  const useMatk = MATK_CLASSES.has(s.className);

  // 쿨다운 설정 (패시브: cooldown_reduce)
  if (skill.cooldown_actions > 0) {
    const cdReduce = getPassive(s, 'cooldown_reduce');
    const cd = Math.max(1, skill.cooldown_actions - Math.floor(cdReduce / 25)); // 25%마다 1턴 감소
    s.skillCooldowns.set(skill.id, cd);
  }

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
        // 패시브: spell_amp (마법 증폭)
        if (spellAmp > 0) dmg = Math.round(dmg * (1 + spellAmp / 100));
        // 패시브: judge_amp (성직자 공격 스킬 증폭) / holy_judge (신성 심판자)
        const judgeAmp = getPassive(s, 'judge_amp') + getPassive(s, 'holy_judge');
        if (judgeAmp > 0 && s.className === 'cleric') dmg = Math.round(dmg * (1 + judgeAmp / 100));
        // 패시브: crit_damage (치명타 추가 배율) + 접두사: 날카로움(crit_dmg_pct)
        if (d.crit) {
          const critDmgBonus = getPassive(s, 'crit_damage') + (s.equipPrefixes.crit_dmg_pct || 0);
          if (critDmgBonus > 0) dmg = Math.round(dmg * (1 + critDmgBonus / 100));
        }
        s.monsterHp -= dmg;
        addLog(s, `[${skill.name}] ${dmg} 데미지${d.crit ? ' (치명타!)' : ''}`);

        // 접두사: 흡혈귀(lifesteal_pct)
        const prefixLifesteal = s.equipPrefixes.lifesteal_pct || 0;
        if (prefixLifesteal > 0 && dmg > 0) {
          const heal = Math.round(dmg * prefixLifesteal / 1000); // 값이 5~20 → 0.5%~2.0%
          if (heal > 0) {
            s.playerHp = Math.min(s.playerMaxHp, s.playerHp + heal);
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
          const bleedDmg = Math.round(s.playerStats.atk * 0.5);
          addEffect(s, { type: 'dot', value: bleedDmg, remainingActions: 3, source: 'player' });
          addLog(s, `출혈 발동!`);
        }

        if (skill.effect_type === 'lifesteal') {
          let heal = Math.round(dmg * skill.effect_value / 100);
          const lsAmp = getPassive(s, 'lifesteal_amp');
          if (lsAmp > 0) heal = Math.round(heal * (1 + lsAmp / 100));
          s.playerHp = Math.min(s.playerMaxHp, s.playerHp + heal);
          addLog(s, `[${skill.name}] HP +${heal} 흡혈`);
        }
        if (skill.effect_type === 'hp_pct_damage') {
          const extra = Math.round(Math.max(0, s.monsterHp) * skill.effect_value / 100);
          s.monsterHp -= extra;
          addLog(s, `[${skill.name}] 추가 고정 ${extra} 데미지`);
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
        addLog(s, `[${skill.name}] 자신 HP -${cost}`);
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
      const dotDmg = Math.round(s.playerStats.atk * 0.7);
      for (let i = 0; i < hits; i++) {
        const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk);
        if (!d.miss) {
          s.monsterHp -= d.damage;
          addLog(s, `[${skill.name}] ${i + 1}타 ${d.damage}`);
          addEffect(s, { type: 'poison', value: dotDmg, remainingActions: 3, source: 'player' });
        }
      }
      break;
    }

    case 'dot': {
      const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk, skill.flat_damage);
      if (!d.miss) {
        s.monsterHp -= d.damage;
        addLog(s, `[${skill.name}] ${d.damage} 데미지${d.crit ? '!' : ''}`);
        const dotDmg = Math.round(s.playerStats.atk * 1.0);
        const stormExt = getPassive(s, 'elemental_storm') > 0 ? 1 : 0; // 도트 지속 +1
        addEffect(s, { type: 'dot', value: dotDmg, remainingActions: skill.effect_duration + stormExt, source: 'player' });
        addLog(s, `[${skill.name}] 도트 ${skill.effect_duration + stormExt}행동`);
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
      const dotDmg = Math.round(s.playerStats.atk * 0.8);
      addEffect(s, { type: 'poison', value: dotDmg, remainingActions: skill.effect_duration, source: 'player' });
      // 스피드 감소
      if (skill.effect_value > 0) {
        addEffect(s, { type: 'speed_mod', value: -skill.effect_value, remainingActions: skill.effect_duration, source: 'player' });
        addLog(s, `[${skill.name}] 독 + 스피드 감소`);
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
        addLog(s, `[${skill.name}] 독 폭발! ${totalBurst} 데미지`);
        s.statusEffects = s.statusEffects.filter(e => !(e.type === 'poison' && e.source === 'player'));
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
        if (Math.random() < 0.5) {
          addLog(s, `[${skill.name}] 몬스터가 기절에 저항!`);
        } else {
          addEffect(s, { type: 'stun', value: 0, remainingActions: 1, source: 'player' });
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
        if (Math.random() < 0.5) {
          addLog(s, `[${skill.name}] 몬스터가 기절에 저항!`);
        } else {
          const stunExt = getPassive(s, 'stun_extend');
          addEffect(s, { type: 'stun', value: 0, remainingActions: skill.effect_duration + stunExt, source: 'player' });
          addLog(s, `[${skill.name}] 스턴 ${skill.effect_duration + stunExt}행동!`);
        }
      } else {
        addLog(s, `[${skill.name}] 빗나감!`);
      }
      break;
    }

    case 'gauge_freeze': {
      const freezeExt = getPassive(s, 'freeze_extend');
      const gcAmp2 = getPassive(s, 'gauge_control_amp');
      const freezeDur = Math.round((skill.effect_duration + freezeExt) * (1 + gcAmp2 / 100));
      addEffect(s, { type: 'gauge_freeze', value: 0, remainingActions: freezeDur, source: 'player' });
      addLog(s, `[${skill.name}] 적 게이지 동결 ${freezeDur}행동!`);
      break;
    }

    case 'gauge_fill': {
      s.playerGauge = GAUGE_MAX;
      addLog(s, `[${skill.name}] 게이지 충전! 연속행동!`);
      break;
    }

    case 'accuracy_debuff': {
      s.monsterGauge = Math.round(s.monsterGauge * 0.5);
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
      s.statusEffects = s.statusEffects.filter(e => !(e.type === 'shield'));
      const d = calcDamage(s.playerStats, s.monsterStats, skill.damage_mult, useMatk, skill.flat_damage);
      if (!d.miss) {
        s.monsterHp -= d.damage;
        addLog(s, `[${skill.name}] 실드 파괴 + ${d.damage} 데미지${d.crit ? '!' : ''}`);
      }
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
async function autoAction(s: ActiveSession): Promise<void> {
  // 1. HP 임계값 이하 → 포션 (3턴 쿨타임)
  if (s.autoPotionEnabled && s.potionCooldown <= 0 && s.playerHp / s.playerMaxHp * 100 < s.autoPotionThreshold) {
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
    // 성직자 치유
    const healSkill = s.skills.find(sk => sk.effect_type === 'heal_pct' && !s.skillCooldowns.has(sk.id));
    if (healSkill) {
      await executeSkill(s, healSkill);
      return;
    }
  }

  // 2. 가장 강한 스킬
  const available = s.skills
    .filter(sk => {
      if (sk.cooldown_actions === 0) return true; // 기본기
      const cd = s.skillCooldowns.get(sk.id);
      return !cd || cd <= 0;
    })
    .sort((a, b) => b.damage_mult - a.damage_mult);

  // 기본기가 아닌 스킬 우선
  const nonBasic = available.find(sk => sk.cooldown_actions > 0);
  if (nonBasic) {
    await executeSkill(s, nonBasic);
    return;
  }

  // 3. 기본 공격 (첫 번째 스킬 = 기본기)
  const basic = available[0];
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
function monsterAction(s: ActiveSession): void {
  // 스턴 체크
  if (hasEffect(s, 'player', 'stun')) {
    addLog(s, '몬스터가 기절 상태!');
    tickDownEffects(s, 'player'); // monster's debuffs from player
    return;
  }

  // 패시브: guard_instinct (HP 40% 이하 시 방어 증가)
  let playerDefStats = s.playerStats;
  const guardInstinct = getPassive(s, 'guard_instinct');
  if (guardInstinct > 0 && s.playerHp / s.playerMaxHp < 0.4) {
    playerDefStats = { ...s.playerStats, def: Math.round(s.playerStats.def * (1 + guardInstinct / 100)) };
  }

  const d = calcDamage(s.monsterStats, playerDefStats, 1.0, false);

  // 명중률 디버프
  const accDebuff = s.statusEffects.find(e => e.type === 'accuracy_debuff' && e.source === 'player');
  if (accDebuff && Math.random() * 100 < accDebuff.value) {
    addLog(s, '몬스터 공격 빗나감! (연막)');
    tickDownEffects(s, 'player');
    return;
  }

  if (d.miss) {
    addLog(s, '몬스터 공격 빗나감!');
  } else {
    let dmg = d.damage;

    // 무적 체크
    if (hasEffect(s, 'monster', 'invincible')) {
      addLog(s, `무적! 데미지 무효화`);
      tickDownEffects(s, 'player');
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

    if (dmg > 0) {
      s.playerHp -= dmg;
      addLog(s, `몬스터가 ${dmg} 데미지${d.crit ? ' (치명타!)' : ''}`);
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

  tickDownEffects(s, 'player');
}

// ── 몬스터 처치 ──
async function handleMonsterDeath(s: ActiveSession): Promise<void> {
  const mr = await query<MonsterDef>(
    'SELECT id, name, level, max_hp, exp_reward, gold_reward, drop_table, stats FROM monsters WHERE id = $1',
    [s.monsterId]
  );
  const m = mr.rows[0];
  if (!m) return;

  // 접두사 + 프리미엄 부스터
  const charBoost = await query<{ gold_boost_until: string | null; drop_boost_until: string | null }>(
    'SELECT gold_boost_until, drop_boost_until FROM characters WHERE id = $1', [s.characterId]
  );
  const goldBonusPct = s.equipPrefixes.gold_bonus_pct || 0;
  const expBonusPct = s.equipPrefixes.exp_bonus_pct || 0;
  const goldBoostActive = charBoost.rows[0]?.gold_boost_until && new Date(charBoost.rows[0].gold_boost_until) > new Date();
  const dropBoostActive = charBoost.rows[0]?.drop_boost_until && new Date(charBoost.rows[0].drop_boost_until) > new Date();
  const finalGold = Math.floor(m.gold_reward * (1 + goldBonusPct / 100) * (goldBoostActive ? 1.5 : 1.0));

  addLog(s, `${m.name}을(를) 처치! +${m.exp_reward}exp, +${finalGold}G`);

  const char = await loadCharacter(s.characterId);
  if (!char) return;

  // 온라인 보너스: 경험치 +50% + 접두사 경험 보너스
  const ONLINE_EXP_BONUS = 1.5;
  const boostActive = char.exp_boost_until && new Date(char.exp_boost_until) > new Date();
  const boostedExp = Math.floor(m.exp_reward * ONLINE_EXP_BONUS * (boostActive ? 1.5 : 1.0) * (1 + expBonusPct / 100));
  const result = applyExpGain(char.level, char.exp, boostedExp, char.class_name);

  if (result.levelsGained > 0) {
    addLog(s, `레벨업! Lv.${result.newLevel}`);
    const g = result.statGrowth;
    await query(
      `UPDATE characters SET level=$1, exp=$2, gold=gold+$3::int,
              max_hp=max_hp+$4, hp=max_hp+$4, node_points=node_points+$5,
              stats = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
                stats,
                '{str}', (COALESCE((stats->>'str')::int,0) + $7)::text::jsonb),
                '{dex}', (COALESCE((stats->>'dex')::int,0) + $8)::text::jsonb),
                '{int}', (COALESCE((stats->>'int')::int,0) + $9)::text::jsonb),
                '{vit}', (COALESCE((stats->>'vit')::int,0) + $10)::text::jsonb),
                '{spd}', (COALESCE((stats->>'spd')::int,0) + $11)::text::jsonb),
                '{cri}', (COALESCE((stats->>'cri')::int,0) + $12)::text::jsonb)
       WHERE id=$6`,
      [result.newLevel, result.newExp, finalGold,
       result.hpGained, result.nodePointsGained, s.characterId,
       g.str, g.dex, g.int, g.vit, g.spd, g.cri]
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

  let drops = rollDrops(m);
  // 드롭 부스터: +30% 추가 드롭 (기존 드롭 외 추가 판정)
  if (dropBoostActive) {
    const extraDrops = rollDrops(m); // 한 번 더 굴림
    for (const ed of extraDrops) {
      if (Math.random() < 0.3) drops.push(ed); // 30% 확률로 추가
    }
  }
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
  const savedHp = Math.round(s.playerMaxHp * 0.25);
  s.playerHp = 0; // 클라이언트에 사망 상태 전달
  await query(
    'UPDATE characters SET hp=$1, location=$2, last_online_at=NOW() WHERE id=$3',
    [savedHp, 'village', s.characterId]
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
      effectivePlayerSpeed = Math.max(10, effectivePlayerSpeed);
      effectiveMonsterSpeed = Math.max(10, effectiveMonsterSpeed);

      // 접두사: 재생(hp_regen) → 틱당 HP 회복
      if (s.equipPrefixes.hp_regen && s.playerHp < s.playerMaxHp && s.playerHp > 0) {
        s.playerHp = Math.min(s.playerMaxHp, s.playerHp + Math.round(s.equipPrefixes.hp_regen / 10)); // 100ms당 1/10
        s.dirty = true;
      }

      // 게이지 충전 (GAUGE_FILL_RATE로 스케일링)
      if (!s.waitingInput) {
        s.playerGauge += effectivePlayerSpeed * GAUGE_FILL_RATE;
      }

      // 몬스터 게이지 동결 체크
      if (!hasEffect(s, 'player', 'gauge_freeze') && !hasEffect(s, 'player', 'stun')) {
        s.monsterGauge += effectiveMonsterSpeed * GAUGE_FILL_RATE;
      }

      // 몬스터 행동
      if (s.monsterGauge >= GAUGE_MAX) {
        monsterAction(s);
        s.monsterGauge = 0;
        processDots(s, 'monster');
        s.dirty = true;

        if (s.playerHp <= 0) {
          await handlePlayerDeath(s);
          continue;
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
          tickDownEffects(s, 'monster');
          processDots(s, 'player');
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
    potions: undefined,
    autoPotion: { enabled: s.autoPotionEnabled, threshold: s.autoPotionThreshold },
    exp,
    expMax,
    serverTime: Date.now(),
  };

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
  // mana_flow / mana_overload: 마법공격 +N%
  const matkBonus = (pMap.get('mana_flow') || 0) + (pMap.get('mana_overload') || 0);
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
  tickDownEffects(s, 'monster');
  processDots(s, 'player');
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

// 장비 변경 시 인메모리 세션 스탯 갱신
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
