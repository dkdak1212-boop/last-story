// 길드 시스템 헬퍼 — v1.0
// 길드 레벨, 스킬, 기여도

import { query } from '../db/pool.js';

export const GUILD_MAX_LEVEL = 20;
export const GUILD_EXP_RATIO = 0.05; // 멤버 사냥 EXP의 5% 기여
export const DAILY_DONATION_CAP = 1_000_000;

export const GUILD_SKILL_KEYS = ['hp', 'gold', 'exp', 'drop'] as const;
export type GuildSkillKey = (typeof GUILD_SKILL_KEYS)[number];

// 단계당 효과(%) — `+1%/단계` 등
export const GUILD_SKILL_PCT: Record<GuildSkillKey, number> = {
  hp: 1,    // maxHp +1%/단계
  gold: 2,  // gold +2%/단계
  exp: 2,   // exp +2%/단계
  drop: 1,  // drop +1%/단계
};

export const GUILD_SKILL_LABEL: Record<GuildSkillKey, string> = {
  hp: '체력',
  gold: '황금',
  exp: '경험',
  drop: '드랍',
};

export const GUILD_SKILL_MAX = 10;

// 스킬 업그레이드 비용 (다음 단계 비용)
export function getGuildSkillUpgradeCost(nextLevel: number): number {
  return nextLevel * 100_000;
}

// 스킬 업그레이드 길드레벨 요구치
export function getGuildSkillReqLevel(nextLevel: number): number {
  return nextLevel * 2;
}

// 길드 EXP → 다음 레벨 임계치
export function expToNextGuild(level: number): number {
  return Math.floor(200_000 * Math.pow(level, 2.4));
}

// 길드 스킬 캐시 (단순 in-memory, 5초 TTL)
const skillCache = new Map<number, { skills: Record<string, number>; ts: number }>();
const SKILL_CACHE_TTL = 5000;

export async function getGuildSkillsForCharacter(characterId: number): Promise<Record<GuildSkillKey, number>> {
  const empty: Record<GuildSkillKey, number> = { hp: 0, gold: 0, exp: 0, drop: 0 };
  const r = await query<{ guild_id: number }>(
    'SELECT guild_id FROM guild_members WHERE character_id = $1', [characterId]
  );
  if (r.rowCount === 0) return empty;
  const guildId = r.rows[0].guild_id;

  const now = Date.now();
  const cached = skillCache.get(guildId);
  if (cached && now - cached.ts < SKILL_CACHE_TTL) {
    return { ...empty, ...cached.skills } as Record<GuildSkillKey, number>;
  }

  const sr = await query<{ skill_key: string; level: number }>(
    'SELECT skill_key, level FROM guild_skills WHERE guild_id = $1', [guildId]
  );
  const skills: Record<string, number> = {};
  for (const row of sr.rows) skills[row.skill_key] = row.level;
  skillCache.set(guildId, { skills, ts: now });
  return { ...empty, ...skills } as Record<GuildSkillKey, number>;
}

export function invalidateGuildSkillCache(guildId: number) {
  skillCache.delete(guildId);
}

// 사냥 EXP 기여 — 캐릭터가 길드원이면 5% 적립 + 길드 레벨업 처리
export async function contributeGuildExp(characterId: number, expGained: number): Promise<void> {
  if (expGained <= 0) return;
  const r = await query<{ guild_id: number }>(
    'SELECT guild_id FROM guild_members WHERE character_id = $1', [characterId]
  );
  if (r.rowCount === 0) return;
  const guildId = r.rows[0].guild_id;
  const contrib = Math.floor(expGained * GUILD_EXP_RATIO);
  if (contrib <= 0) return;

  // 기여도 적립
  await query(
    `INSERT INTO guild_contributions (guild_id, character_id, exp_contributed, gold_donated)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (guild_id, character_id) DO UPDATE
       SET exp_contributed = guild_contributions.exp_contributed + $3`,
    [guildId, characterId, contrib]
  );

  // 길드 EXP 증가 + 레벨업 체크
  const gr = await query<{ level: number; exp: string }>(
    'SELECT level, exp FROM guilds WHERE id = $1 FOR UPDATE', [guildId]
  );
  if (gr.rowCount === 0) return;
  let level = gr.rows[0].level;
  let exp = Number(gr.rows[0].exp) + contrib;

  while (level < GUILD_MAX_LEVEL && exp >= expToNextGuild(level)) {
    exp -= expToNextGuild(level);
    level += 1;
  }

  await query('UPDATE guilds SET level = $1, exp = $2 WHERE id = $3', [level, exp, guildId]);
}
