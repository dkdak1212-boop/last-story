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

// ─────────────────────────────────────────────
// 사냥 EXP 기여 — 메모리 배치 집계 + 주기 flush
// 매 킬마다 4쿼리(SELECT guild_members / UPSERT contributions / FOR UPDATE guilds / UPDATE) →
// 5초 interval flush 로 N 킬을 캐릭당 1 UPSERT + 길드당 1 UPDATE 로 축약.
// SELECT FOR UPDATE 락 대기도 제거 (원자적 UPDATE ... RETURNING 사용).
// ─────────────────────────────────────────────

// 캐릭 → 길드ID 캐시 (부팅 시 preload, 가입·탈퇴 시 invalidate)
const memberGuildCache = new Map<number, number | null>();
let memberCacheReady = false;

export async function preloadGuildMemberCache(): Promise<void> {
  const r = await query<{ character_id: number; guild_id: number }>(
    'SELECT character_id, guild_id FROM guild_members'
  );
  memberGuildCache.clear();
  for (const row of r.rows) memberGuildCache.set(row.character_id, row.guild_id);
  memberCacheReady = true;
  console.log(`[guild-cache] preloaded ${r.rowCount} member mappings`);
}

export function setMemberGuild(characterId: number, guildId: number | null): void {
  memberGuildCache.set(characterId, guildId);
}

export function clearMemberGuild(characterId: number): void {
  memberGuildCache.delete(characterId);
}

// 캐릭별 누적 기여 — flush 전까지 메모리에만 있음
const pendingContrib = new Map<number, { guildId: number; expPending: number }>();

// 호출부 fire-and-forget 호환: void 반환, 내부에서 멤버 캐시 miss 시 async 폴백
export function contributeGuildExp(characterId: number, expGained: number): void {
  if (expGained <= 0) return;
  const contrib = Math.floor(expGained * GUILD_EXP_RATIO);
  if (contrib <= 0) return;

  // 캐시 hit 시 즉시 누적
  if (memberCacheReady) {
    const guildId = memberGuildCache.get(characterId);
    if (guildId == null) return; // 비길드원
    const cur = pendingContrib.get(characterId);
    if (cur) cur.expPending += contrib;
    else pendingContrib.set(characterId, { guildId, expPending: contrib });
    return;
  }

  // 캐시 미 준비 — DB 폴백 (부팅 초기에만 발생)
  (async () => {
    try {
      const r = await query<{ guild_id: number }>(
        'SELECT guild_id FROM guild_members WHERE character_id = $1', [characterId]
      );
      if (r.rowCount === 0) { memberGuildCache.set(characterId, null); return; }
      const guildId = r.rows[0].guild_id;
      memberGuildCache.set(characterId, guildId);
      const cur = pendingContrib.get(characterId);
      if (cur) cur.expPending += contrib;
      else pendingContrib.set(characterId, { guildId, expPending: contrib });
    } catch (e) {
      console.error('[guild-contrib] member lookup err', e);
    }
  })();
}

export async function flushGuildContributions(): Promise<void> {
  if (pendingContrib.size === 0) return;
  // snapshot + clear (다음 주기 fill 과 격리)
  const batch: { characterId: number; guildId: number; exp: number }[] = [];
  for (const [charId, v] of pendingContrib) {
    batch.push({ characterId: charId, guildId: v.guildId, exp: v.expPending });
  }
  pendingContrib.clear();

  // guild_contributions 다중 upsert — 한 INSERT 문에 모든 (guild, char) 쌍
  try {
    const values: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const b of batch) {
      values.push(`($${i++}, $${i++}, $${i++}, 0)`);
      params.push(b.guildId, b.characterId, b.exp);
    }
    await query(
      `INSERT INTO guild_contributions (guild_id, character_id, exp_contributed, gold_donated)
       VALUES ${values.join(',')}
       ON CONFLICT (guild_id, character_id) DO UPDATE
         SET exp_contributed = guild_contributions.exp_contributed + EXCLUDED.exp_contributed`,
      params
    );
  } catch (e) {
    console.error('[guild-contrib-flush] contributions err', e);
  }

  // 길드별 합산 → UPDATE guilds (원자적 exp 증가 후 레벨업 체크)
  const byGuild = new Map<number, number>();
  for (const b of batch) byGuild.set(b.guildId, (byGuild.get(b.guildId) ?? 0) + b.exp);

  for (const [guildId, expDelta] of byGuild) {
    try {
      const r = await query<{ level: number; exp: string }>(
        'UPDATE guilds SET exp = exp + $1 WHERE id = $2 RETURNING level, exp',
        [expDelta, guildId]
      );
      if (r.rowCount === 0) continue;
      let level = r.rows[0].level;
      let curExp = Number(r.rows[0].exp);
      // 레벨업 체크 (임계 초과 시에만 추가 UPDATE — 드문 경우)
      if (level < GUILD_MAX_LEVEL && curExp >= expToNextGuild(level)) {
        while (level < GUILD_MAX_LEVEL && curExp >= expToNextGuild(level)) {
          curExp -= expToNextGuild(level);
          level += 1;
        }
        await query('UPDATE guilds SET level = $1, exp = $2 WHERE id = $3', [level, curExp, guildId]);
      }
    } catch (e) {
      console.error('[guild-contrib-flush] guild upd err', guildId, e);
    }
  }
}

let flushInterval: NodeJS.Timeout | null = null;
export function startGuildContribFlushLoop(): void {
  if (flushInterval) return;
  flushInterval = setInterval(() => {
    flushGuildContributions().catch(e => console.error('[guild-contrib-flush] loop err', e));
  }, 5000);
  console.log('[guild-contrib] flush loop started (5s)');
}
export function stopGuildContribFlushLoop(): void {
  if (flushInterval) { clearInterval(flushInterval); flushInterval = null; }
}
