// PvP 비동기 전투 시뮬레이션
import { query } from '../db/pool.js';
import { calcDamage, type EffectiveStats } from '../game/formulas.js';
import { loadCharacter, getEffectiveStats } from '../game/character.js';

interface Side {
  id: number;
  name: string;
  className: string;
  stats: EffectiveStats;
  hp: number;
  mp: number;
  maxHp: number;
  maxMp: number;
  skills: SkillDef[];
  cooldowns: Record<number, number>; // skillId -> readyAt (virtual tick)
}

interface SkillDef {
  id: number;
  name: string;
  cooldown_sec: number;
  mp_cost: number;
  damage_mult: number;
  kind: string;
}

async function loadSide(characterId: number): Promise<Side | null> {
  const char = await loadCharacter(characterId);
  if (!char) return null;
  const eff = await getEffectiveStats(char);
  // 길드 버프 +5% 적용
  const gr = await query<{ stat_buff_pct: number }>(
    `SELECT g.stat_buff_pct FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id WHERE gm.character_id = $1`,
    [characterId]
  );
  if (gr.rowCount && gr.rowCount > 0) {
    const mult = 1 + Number(gr.rows[0].stat_buff_pct) / 100;
    eff.atk *= mult; eff.matk *= mult; eff.def *= mult; eff.mdef *= mult;
  }
  const sr = await query<SkillDef>(
    `SELECT s.id, s.name, s.cooldown_sec, s.mp_cost, s.damage_mult, s.kind
     FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
     WHERE cs.character_id = $1 AND cs.auto_use = TRUE AND s.required_level <= $2
       AND s.kind IN ('damage', 'heal')
     ORDER BY s.damage_mult DESC`,
    [characterId, char.level]
  );
  return {
    id: char.id, name: char.name, className: char.class_name,
    stats: eff, hp: char.max_hp, mp: char.max_mp, maxHp: char.max_hp, maxMp: char.max_mp,
    skills: sr.rows, cooldowns: {},
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
  log.push(`${attacker.name}(Lv.${(await loadCharacter(attackerId))?.level}) vs ${defender.name}(Lv.${(await loadCharacter(defenderId))?.level})`);

  // 가상 타임라인 (ms 단위)
  let now = 0;
  let nextA = attacker.stats.tickMs;
  let nextD = defender.stats.tickMs;
  const MAX_TURNS = 100;
  let turns = 0;

  while (attacker.hp > 0 && defender.hp > 0 && turns < MAX_TURNS) {
    turns++;
    if (nextA <= nextD) {
      now = nextA;
      act(attacker, defender, log, now);
      nextA = now + attacker.stats.tickMs;
    } else {
      now = nextD;
      act(defender, attacker, log, now);
      nextD = now + defender.stats.tickMs;
    }
  }

  const winner = attacker.hp <= 0 ? 'defender' : 'attacker';
  log.push(winner === 'attacker' ? `${attacker.name} 승리!` : `${defender.name} 승리!`);

  return { winner, log, attackerName: attacker.name, defenderName: defender.name, turns };
}

function act(me: Side, foe: Side, log: string[], now: number) {
  // 자동 스킬 (MP 충분 & 쿨다운 완료 중 damage_mult 최고)
  const usable = me.skills.filter(s => (me.cooldowns[s.id] ?? 0) <= now && me.mp >= s.mp_cost);
  const best = usable[0];
  const isMage = ['mage', 'priest', 'druid'].includes(me.className);

  if (best) {
    if (best.kind === 'heal') {
      const heal = Math.round(me.stats.matk * best.damage_mult);
      me.hp = Math.min(me.maxHp, me.hp + heal);
      log.push(`${me.name} [${best.name}] HP+${heal}`);
    } else {
      const d = calcDamage(me.stats, foe.stats, best.damage_mult, isMage);
      if (d.miss) log.push(`${me.name} [${best.name}] 빗나감`);
      else { foe.hp -= d.damage; log.push(`${me.name} [${best.name}] ${d.damage} 데미지${d.crit ? ' (치명타!)' : ''}`); }
    }
    me.mp -= best.mp_cost;
    me.cooldowns[best.id] = now + best.cooldown_sec * 1000;
  } else {
    // 기본 공격
    const d = calcDamage(me.stats, foe.stats, 1.0, false);
    if (d.miss) log.push(`${me.name} 기본공격 빗나감`);
    else { foe.hp -= d.damage; log.push(`${me.name} ${d.damage} 데미지${d.crit ? ' (치명타!)' : ''}`); }
  }
}

// ELO 계산 (K=32)
export function calculateEloChange(winnerElo: number, loserElo: number): number {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  return Math.round(K * (1 - expected));
}
