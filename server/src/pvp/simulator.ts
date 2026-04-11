// PvP 비동기 전투 시뮬레이션 — v2: 상태이상/버프/실드 지원
import { query } from '../db/pool.js';
import { calcDamage, type EffectiveStats } from '../game/formulas.js';
import { loadCharacter, getEffectiveStats } from '../game/character.js';

const GAUGE_MAX = 1000;
const MAX_TICKS = 2000;
const PVP_DAMAGE_MULT = 0.45; // PvP 전용 데미지 감소 (55% 감소)

// 속도 감쇠 — 소프트캡 300, 이후 평방근 감쇠
function diminishSpeed(rawSpd: number): number {
  const SOFT_CAP = 300;
  if (rawSpd <= SOFT_CAP) return rawSpd;
  return Math.round(SOFT_CAP + Math.sqrt(rawSpd - SOFT_CAP) * 15);
}

interface StatusEffect {
  type: string; value: number; remaining: number;
}

interface Side {
  id: number;
  name: string;
  className: string;
  stats: EffectiveStats;
  hp: number;
  maxHp: number;
  gauge: number;
  skills: SkillDef[];
  cooldowns: Map<number, number>;
  actionCount: number;
  effects: StatusEffect[];
}

interface SkillDef {
  id: number; name: string; cooldown_actions: number; damage_mult: number;
  kind: string; flat_damage: number; effect_type: string; effect_value: number; effect_duration: number;
}

async function loadSide(characterId: number): Promise<Side | null> {
  const char = await loadCharacter(characterId);
  if (!char) return null;
  const eff = await getEffectiveStats(char); // 길드 stat_buff_pct는 getEffectiveStats에서 자동 적용
  const sr = await query<SkillDef>(
    `SELECT s.id, s.name, s.cooldown_actions, s.damage_mult, s.kind, s.flat_damage,
            s.effect_type, s.effect_value, s.effect_duration
     FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
     WHERE cs.character_id = $1 AND cs.auto_use = TRUE AND s.required_level <= $2
     ORDER BY s.damage_mult DESC
     LIMIT 6`,
    [characterId, char.level]
  );
  const pvpHp = char.max_hp * 10; // PVP HP 10배 보정
  return {
    id: char.id, name: char.name, className: char.class_name,
    stats: eff, hp: pvpHp, maxHp: pvpHp,
    gauge: 0, skills: sr.rows, cooldowns: new Map(), actionCount: 0,
    effects: [],
  };
}

export async function simulatePvP(attackerId: number, defenderId: number): Promise<{
  winner: 'attacker' | 'defender'; log: string[];
  attackerName: string; defenderName: string; turns: number;
}> {
  const attacker = await loadSide(attackerId);
  const defender = await loadSide(defenderId);
  if (!attacker || !defender) throw new Error('load failed');

  const log: string[] = [];
  log.push(`${attacker.name}(Lv.${attacker.stats.str ? '?' : '?'}) vs ${defender.name}`);

  let ticks = 0;
  let turns = 0;

  while (attacker.hp > 0 && defender.hp > 0 && ticks < MAX_TICKS) {
    ticks++;

    // 스피드 보정 (속도 디버프 적용)
    let atkSpd = attacker.stats.spd;
    let defSpd = defender.stats.spd;
    for (const e of attacker.effects) { if (e.type === 'speed_mod') atkSpd = Math.round(atkSpd * (1 + e.value / 100)); }
    for (const e of defender.effects) { if (e.type === 'speed_mod') defSpd = Math.round(defSpd * (1 + e.value / 100)); }

    attacker.gauge += diminishSpeed(Math.max(10, atkSpd));
    defender.gauge += diminishSpeed(Math.max(10, defSpd));

    if (attacker.gauge >= GAUGE_MAX) {
      attacker.gauge = 0;
      attacker.actionCount++;
      turns++;
      tickCooldowns(attacker);
      // 스턴 체크
      const stunIdx = attacker.effects.findIndex(e => e.type === 'stun');
      if (stunIdx >= 0) {
        log.push(`${attacker.name} 기절!`);
        attacker.effects[stunIdx].remaining--;
        if (attacker.effects[stunIdx].remaining <= 0) attacker.effects.splice(stunIdx, 1);
      } else {
        act(attacker, defender, log);
      }
      processDots(attacker, defender, log);
      tickEffects(attacker);
      if (defender.hp <= 0) break;
      if (attacker.hp <= 0) break;
    }

    if (defender.gauge >= GAUGE_MAX) {
      defender.gauge = 0;
      defender.actionCount++;
      turns++;
      tickCooldowns(defender);
      const stunIdx = defender.effects.findIndex(e => e.type === 'stun');
      if (stunIdx >= 0) {
        log.push(`${defender.name} 기절!`);
        defender.effects[stunIdx].remaining--;
        if (defender.effects[stunIdx].remaining <= 0) defender.effects.splice(stunIdx, 1);
      } else {
        act(defender, attacker, log);
      }
      processDots(defender, attacker, log);
      tickEffects(defender);
      if (attacker.hp <= 0) break;
      if (defender.hp <= 0) break;
    }
  }

  const winner = attacker.hp <= 0 ? 'defender' : 'attacker';
  log.push(winner === 'attacker' ? `${attacker.name} 승리!` : `${defender.name} 승리!`);
  return { winner, log, attackerName: attacker.name, defenderName: defender.name, turns };
}

function tickCooldowns(side: Side) {
  for (const [skId, cd] of side.cooldowns) {
    if (cd <= 1) side.cooldowns.delete(skId);
    else side.cooldowns.set(skId, cd - 1);
  }
}

function tickEffects(side: Side) {
  for (const e of side.effects) {
    if (e.type !== 'stun') e.remaining--;
  }
  side.effects = side.effects.filter(e => e.remaining > 0);
}

function processDots(_me: Side, foe: Side, log: string[]) {
  for (const e of foe.effects) {
    if (e.type === 'dot' || e.type === 'poison') {
      const dmg = Math.round(e.value * PVP_DAMAGE_MULT);
      foe.hp -= dmg;
      log.push(`${foe.name} [도트] ${dmg}`);
    }
  }
}

function act(me: Side, foe: Side, log: string[]) {
  const useMatk = me.stats.matk > me.stats.atk;

  // HP 30% 이하 → 힐 우선
  const healSkill = me.skills.find(s => s.effect_type === 'heal_pct' && !me.cooldowns.has(s.id));
  if (healSkill && me.hp / me.maxHp < 0.3) {
    const heal = Math.round(me.maxHp * healSkill.effect_value / 100);
    me.hp = Math.min(me.maxHp, me.hp + heal);
    log.push(`${me.name} [${healSkill.name}] HP+${heal}`);
    if (healSkill.cooldown_actions > 0) me.cooldowns.set(healSkill.id, healSkill.cooldown_actions);
    return;
  }

  // 가장 강한 스킬 선택
  const usable = me.skills.filter(s => {
    if (s.cooldown_actions === 0) return true;
    const cd = me.cooldowns.get(s.id);
    return !cd || cd <= 0;
  });
  const nonBasic = usable.find(s => s.cooldown_actions > 0 && s.kind !== 'heal' && s.kind !== 'buff');
  const best = nonBasic || usable.find(s => s.kind !== 'heal') || usable[0];

  if (!best) {
    basicAttack(me, foe, log, useMatk);
    return;
  }

  // 스킬 효과 처리
  switch (best.effect_type) {
    case 'damage':
    case 'crit_bonus':
    case 'hp_pct_damage':
    case 'self_damage_pct': {
      const criBonus = best.effect_type === 'crit_bonus' ? best.effect_value : 0;
      const d = calcDamage(me.stats, foe.stats, best.damage_mult, useMatk, best.flat_damage, criBonus);
      if (d.miss) { log.push(`${me.name} [${best.name}] 빗나감`); }
      else {
        const actual = applyDamage(me, foe, d.damage, log);
        log.push(`${me.name} [${best.name}] ${actual}${d.crit ? '!' : ''}`);
        if (best.effect_type === 'hp_pct_damage') {
          const extra = Math.round(Math.max(0, foe.hp) * best.effect_value / 100);
          applyDamage(me, foe, extra, log);
          log.push(`${me.name} 추가 ${extra}`);
        }
      }
      if (best.effect_type === 'self_damage_pct') {
        const cost = Math.round(me.maxHp * best.effect_value / 100);
        me.hp -= cost;
      }
      break;
    }
    case 'lifesteal': {
      const d = calcDamage(me.stats, foe.stats, best.damage_mult, useMatk, best.flat_damage);
      if (!d.miss) {
        const actual = applyDamage(me, foe, d.damage, log);
        const heal = Math.round(actual * best.effect_value / 100);
        me.hp = Math.min(me.maxHp, me.hp + heal);
        log.push(`${me.name} [${best.name}] ${actual}${d.crit ? '!' : ''} 흡혈+${heal}`);
      } else { log.push(`${me.name} [${best.name}] 빗나감`); }
      break;
    }
    case 'multi_hit':
    case 'multi_hit_poison': {
      const hits = Math.round(best.effect_value);
      for (let i = 0; i < hits; i++) {
        const d = calcDamage(me.stats, foe.stats, best.damage_mult, useMatk);
        if (!d.miss) {
          const actual = applyDamage(me, foe, d.damage, log);
          log.push(`${me.name} [${best.name}] ${i + 1}타 ${actual}`);
          if (best.effect_type === 'multi_hit_poison') {
            foe.effects.push({ type: 'poison', value: Math.round(me.stats.atk * 0.15), remaining: 3 });
          }
        }
      }
      break;
    }
    case 'dot': {
      const d = calcDamage(me.stats, foe.stats, best.damage_mult, useMatk, best.flat_damage);
      if (!d.miss) {
        const actual = applyDamage(me, foe, d.damage, log);
        const dotDmg = Math.round(me.stats.atk * 0.3);
        foe.effects.push({ type: 'dot', value: dotDmg, remaining: best.effect_duration });
        log.push(`${me.name} [${best.name}] ${actual} +도트${best.effect_duration}턴`);
      } else { log.push(`${me.name} [${best.name}] 빗나감`); }
      break;
    }
    case 'poison': {
      const d = calcDamage(me.stats, foe.stats, best.damage_mult, useMatk, best.flat_damage);
      if (!d.miss) applyDamage(me, foe, d.damage, log);
      const dotDmg = Math.round(me.stats.atk * 0.25);
      foe.effects.push({ type: 'poison', value: dotDmg, remaining: best.effect_duration });
      if (best.effect_value > 0) foe.effects.push({ type: 'speed_mod', value: -best.effect_value, remaining: best.effect_duration });
      log.push(`${me.name} [${best.name}] 독+속도감소`);
      break;
    }
    case 'stun': {
      const d = calcDamage(me.stats, foe.stats, best.damage_mult, useMatk, best.flat_damage);
      if (!d.miss) {
        const actual = applyDamage(me, foe, d.damage, log);
        foe.effects.push({ type: 'stun', value: 0, remaining: best.effect_duration });
        log.push(`${me.name} [${best.name}] ${actual} 스턴!`);
      } else { log.push(`${me.name} [${best.name}] 빗나감`); }
      break;
    }
    case 'speed_mod':
    case 'self_speed_mod': {
      if (best.damage_mult > 0) {
        const d = calcDamage(me.stats, foe.stats, best.damage_mult, useMatk, best.flat_damage);
        if (!d.miss) { const actual = applyDamage(me, foe, d.damage, log); log.push(`${me.name} [${best.name}] ${actual}`); }
      }
      if (best.effect_type === 'speed_mod') {
        foe.effects.push({ type: 'speed_mod', value: best.effect_value, remaining: best.effect_duration });
      } else {
        me.effects.push({ type: 'speed_mod', value: best.effect_value, remaining: best.effect_duration });
      }
      break;
    }
    case 'shield': {
      const shieldHp = Math.round(me.maxHp * best.effect_value / 100);
      me.effects.push({ type: 'shield', value: shieldHp, remaining: best.effect_duration });
      log.push(`${me.name} [${best.name}] 실드 ${shieldHp}`);
      break;
    }
    case 'shield_break': {
      foe.effects = foe.effects.filter(e => e.type !== 'shield');
      const d = calcDamage(me.stats, foe.stats, best.damage_mult, useMatk, best.flat_damage);
      if (!d.miss) { const actual = applyDamage(me, foe, d.damage, log); log.push(`${me.name} [${best.name}] 실드파괴 ${actual}`); }
      break;
    }
    case 'heal_pct': {
      const heal = Math.round(me.maxHp * best.effect_value / 100);
      me.hp = Math.min(me.maxHp, me.hp + heal);
      log.push(`${me.name} [${best.name}] HP+${heal}`);
      break;
    }
    case 'gauge_reset': {
      foe.gauge = 0;
      if (Math.random() * 100 < best.effect_value) {
        foe.effects.push({ type: 'stun', value: 0, remaining: 1 });
        log.push(`${me.name} [${best.name}] 게이지 리셋+스턴!`);
      } else {
        log.push(`${me.name} [${best.name}] 게이지 리셋`);
      }
      break;
    }
    case 'gauge_freeze': {
      foe.effects.push({ type: 'gauge_freeze', value: 0, remaining: best.effect_duration });
      log.push(`${me.name} [${best.name}] 게이지 동결 ${best.effect_duration}턴`);
      break;
    }
    case 'gauge_fill': {
      me.gauge = GAUGE_MAX;
      log.push(`${me.name} [${best.name}] 게이지 충전!`);
      break;
    }
    case 'damage_reduce': {
      me.effects.push({ type: 'damage_reduce', value: best.effect_value, remaining: best.effect_duration });
      log.push(`${me.name} [${best.name}] 데미지 ${best.effect_value}% 감소`);
      break;
    }
    case 'damage_reflect': {
      me.effects.push({ type: 'damage_reflect', value: best.effect_value, remaining: best.effect_duration });
      log.push(`${me.name} [${best.name}] 반사 ${best.effect_value}%`);
      break;
    }
    case 'invincible': {
      me.effects.push({ type: 'invincible', value: 0, remaining: best.effect_duration });
      log.push(`${me.name} [${best.name}] 무적!`);
      break;
    }
    case 'accuracy_debuff': {
      foe.gauge = Math.round(foe.gauge * 0.5);
      foe.effects.push({ type: 'accuracy_debuff', value: best.effect_value, remaining: best.effect_duration });
      log.push(`${me.name} [${best.name}] 명중감소+게이지↓`);
      break;
    }
    case 'poison_burst': {
      const poisons = foe.effects.filter(e => e.type === 'poison');
      let total = 0;
      for (const p of poisons) total += Math.round(p.value * best.effect_value / 100);
      if (total > 0) {
        applyDamage(me, foe, total, log);
        foe.effects = foe.effects.filter(e => e.type !== 'poison');
        log.push(`${me.name} [${best.name}] 독 폭발 ${total}`);
      }
      break;
    }
    default: {
      basicAttack(me, foe, log, useMatk);
      break;
    }
  }

  if (best.cooldown_actions > 0) me.cooldowns.set(best.id, best.cooldown_actions);
}

/** 방어 효과(무적/실드/데미지감소/반사) 적용 후 실제 HP 차감 + PVP 감소 */
function applyDamage(attacker: Side, target: Side, rawDmg: number, log: string[]): number {
  // 무적
  if (target.effects.some(e => e.type === 'invincible')) {
    log.push(`${target.name} 무적! 데미지 무효`);
    return 0;
  }

  // PVP 데미지 감소
  let dmg = Math.round(rawDmg * PVP_DAMAGE_MULT);

  // damage_reduce 효과
  for (const e of target.effects) {
    if (e.type === 'damage_reduce') {
      dmg = Math.round(dmg * (1 - e.value / 100));
    }
  }

  // 실드 흡수
  for (let i = target.effects.length - 1; i >= 0; i--) {
    const e = target.effects[i];
    if (e.type === 'shield' && dmg > 0) {
      if (e.value >= dmg) {
        e.value -= dmg;
        log.push(`${target.name} 실드 흡수 (잔여 ${e.value})`);
        dmg = 0;
      } else {
        dmg -= e.value;
        log.push(`${target.name} 실드 파괴`);
        target.effects.splice(i, 1);
      }
    }
  }

  if (dmg > 0) target.hp -= dmg;

  // 반사
  for (const e of target.effects) {
    if (e.type === 'damage_reflect' && dmg > 0) {
      const reflected = Math.round(dmg * e.value / 100);
      attacker.hp -= reflected;
      log.push(`${attacker.name} 반사 데미지 ${reflected}`);
    }
  }

  return dmg;
}

function basicAttack(me: Side, foe: Side, log: string[], useMatk: boolean) {
  const d = calcDamage(me.stats, foe.stats, 1.0, useMatk);
  if (d.miss) log.push(`${me.name} 빗나감`);
  else {
    const actual = applyDamage(me, foe, d.damage, log);
    log.push(`${me.name} ${actual}${d.crit ? '!' : ''}`);
  }
}

export function calculateEloChange(winnerElo: number, loserElo: number): number {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  return Math.round(K * (1 - expected));
}
