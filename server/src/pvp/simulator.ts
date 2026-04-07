// PvP 비동기 전투 시뮬레이션 — v0.9 게이지 기반
import { query } from '../db/pool.js';
import { calcDamage, type EffectiveStats } from '../game/formulas.js';
import { loadCharacter, getEffectiveStats } from '../game/character.js';

const GAUGE_MAX = 1000;

interface Side {
  id: number;
  name: string;
  className: string;
  stats: EffectiveStats;
  hp: number;
  maxHp: number;
  gauge: number;
  skills: SkillDef[];
  cooldowns: Map<number, number>; // skillId -> remaining actions
  actionCount: number;
}

interface SkillDef {
  id: number;
  name: string;
  cooldown_actions: number;
  damage_mult: number;
  kind: string;
  flat_damage: number;
}

async function loadSide(characterId: number): Promise<Side | null> {
  const char = await loadCharacter(characterId);
  if (!char) return null;
  const eff = await getEffectiveStats(char);
  // 길드 버프 +5%
  const gr = await query<{ stat_buff_pct: number }>(
    `SELECT g.stat_buff_pct FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id WHERE gm.character_id = $1`,
    [characterId]
  );
  if (gr.rowCount && gr.rowCount > 0) {
    const mult = 1 + Number(gr.rows[0].stat_buff_pct) / 100;
    eff.atk *= mult; eff.matk *= mult; eff.def *= mult; eff.mdef *= mult;
  }
  const sr = await query<SkillDef>(
    `SELECT s.id, s.name, s.cooldown_actions, s.damage_mult, s.kind, s.flat_damage
     FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
     WHERE cs.character_id = $1 AND cs.auto_use = TRUE AND s.required_level <= $2
       AND s.kind IN ('damage', 'heal')
     ORDER BY s.damage_mult DESC`,
    [characterId, char.level]
  );
  return {
    id: char.id, name: char.name, className: char.class_name,
    stats: eff, hp: char.max_hp, maxHp: char.max_hp,
    gauge: 0, skills: sr.rows, cooldowns: new Map(), actionCount: 0,
  };
}

export async function simulatePvP(attackerId: number, defenderId: number): Promise<{
  winner: 'attacker' | 'defender';
  log: string[];
  attackerName: string;
  defenderName: string;
  turns: number;
}> {
  const attacker = await loadSide(attackerId);
  const defender = await loadSide(defenderId);
  if (!attacker || !defender) throw new Error('load failed');

  const log: string[] = [];
  const aChar = await loadCharacter(attackerId);
  const dChar = await loadCharacter(defenderId);
  log.push(`${attacker.name}(Lv.${aChar?.level}) vs ${defender.name}(Lv.${dChar?.level})`);

  const MAX_TICKS = 2000; // 최대 200초
  let ticks = 0;
  let turns = 0;

  while (attacker.hp > 0 && defender.hp > 0 && ticks < MAX_TICKS) {
    ticks++;
    attacker.gauge += attacker.stats.spd;
    defender.gauge += defender.stats.spd;

    // 어택커 행동
    if (attacker.gauge >= GAUGE_MAX) {
      attacker.gauge = 0;
      attacker.actionCount++;
      turns++;
      // 쿨다운 감소
      for (const [skId, cd] of attacker.cooldowns) {
        if (cd > 0) attacker.cooldowns.set(skId, cd - 1);
        if (cd <= 1) attacker.cooldowns.delete(skId);
      }
      act(attacker, defender, log);
      if (defender.hp <= 0) break;
    }

    // 디펜더 행동
    if (defender.gauge >= GAUGE_MAX) {
      defender.gauge = 0;
      defender.actionCount++;
      turns++;
      for (const [skId, cd] of defender.cooldowns) {
        if (cd > 0) defender.cooldowns.set(skId, cd - 1);
        if (cd <= 1) defender.cooldowns.delete(skId);
      }
      act(defender, attacker, log);
      if (attacker.hp <= 0) break;
    }
  }

  const winner = attacker.hp <= 0 ? 'defender' : 'attacker';
  log.push(winner === 'attacker' ? `${attacker.name} 승리!` : `${defender.name} 승리!`);

  return { winner, log, attackerName: attacker.name, defenderName: defender.name, turns };
}

function act(me: Side, foe: Side, log: string[]) {
  const useMatk = me.stats.matk > me.stats.atk;

  // 가장 강한 스킬 (쿨다운 X)
  const usable = me.skills.filter(s => {
    if (s.cooldown_actions === 0) return true;
    const cd = me.cooldowns.get(s.id);
    return !cd || cd <= 0;
  });
  const nonBasic = usable.find(s => s.cooldown_actions > 0);
  const best = nonBasic || usable[0];

  if (best) {
    if (best.kind === 'heal') {
      const heal = Math.round(me.maxHp * 0.25);
      me.hp = Math.min(me.maxHp, me.hp + heal);
      log.push(`${me.name} [${best.name}] HP+${heal}`);
    } else {
      const d = calcDamage(me.stats, foe.stats, best.damage_mult, useMatk, best.flat_damage);
      if (d.miss) log.push(`${me.name} [${best.name}] 빗나감`);
      else { foe.hp -= d.damage; log.push(`${me.name} [${best.name}] ${d.damage}${d.crit ? '!' : ''}`); }
    }
    if (best.cooldown_actions > 0) {
      me.cooldowns.set(best.id, best.cooldown_actions);
    }
  } else {
    const d = calcDamage(me.stats, foe.stats, 1.0, false);
    if (d.miss) log.push(`${me.name} 기본공격 빗나감`);
    else { foe.hp -= d.damage; log.push(`${me.name} ${d.damage}${d.crit ? '!' : ''}`); }
  }
}

export function calculateEloChange(winnerElo: number, loserElo: number): number {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  return Math.round(K * (1 - expected));
}
