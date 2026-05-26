// 길드 시스템 헬퍼 — v1.0
// 길드 레벨, 스킬, 기여도

import { query, withTransaction } from '../db/pool.js';

export const GUILD_MAX_LEVEL = 40;
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

export const GUILD_SKILL_MAX = 20;
// 11단계부터 %/단계 효과 절반 (인플레 완화)
export const GUILD_SKILL_TAPER_LEVEL = 10;

// 스킬 누적 효과(%) — 테이퍼 반영. 1~10단계 전체 효과, 11~20단계 절반.
export function guildSkillTotalPct(key: GuildSkillKey, level: number): number {
  const pct = GUILD_SKILL_PCT[key];
  if (level <= GUILD_SKILL_TAPER_LEVEL) return level * pct;
  return GUILD_SKILL_TAPER_LEVEL * pct + (level - GUILD_SKILL_TAPER_LEVEL) * pct / 2;
}

// 다음 단계로 올릴 때의 증가폭 (테이퍼 반영) — 클라 표시용
export function guildSkillNextIncrement(key: GuildSkillKey, level: number): number {
  if (level >= GUILD_SKILL_MAX) return 0;
  return guildSkillTotalPct(key, level + 1) - guildSkillTotalPct(key, level);
}

// 스킬 업그레이드 비용 (다음 단계 비용) — 11단계+ 가파르게(자금 기부 의미 복원)
export function getGuildSkillUpgradeCost(nextLevel: number): number {
  if (nextLevel <= GUILD_SKILL_TAPER_LEVEL) return nextLevel * 100_000;
  return 1_000_000 + (nextLevel - GUILD_SKILL_TAPER_LEVEL) * 2_000_000;
}

// 스킬 업그레이드 길드레벨 요구치 (스킬 N단계 = 길드 2N) → 스킬20 = 길드40
export function getGuildSkillReqLevel(nextLevel: number): number {
  return nextLevel * 2;
}

// 길드 EXP → 다음 레벨 임계치
//  - 1~19: 기존 곡선 유지 (저렙 길드 영향 없음)
//  - 20+: 엔드게임 곡선 (20→40 합계 약 2.2조, 상위 길드도 1~2달+)
export function expToNextGuild(level: number): number {
  if (level < 20) return Math.floor(200_000 * Math.pow(level, 2.4));
  return Math.floor(15_000_000_000 * Math.pow(1.18, level - 20));
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
  // NaN/Infinity 차단 — Math.floor(NaN)=NaN 이고 (NaN<=0)===false 라 가드를 통과해
  // pendingContrib 에 NaN 이 누적되면 flush 시 bigint 22P02 로 길드 UPDATE 전체가 실패함.
  if (!Number.isFinite(expGained) || expGained <= 0) return;
  const contrib = Math.floor(expGained * GUILD_EXP_RATIO);
  if (!Number.isFinite(contrib) || contrib <= 0) return;

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
    // 방어: 비유한값/음수 exp 는 제외 — 한 항목이 길드 UPDATE 전체를 22P02 로 막는 것 차단
    if (!Number.isFinite(v.expPending) || v.expPending <= 0) continue;
    batch.push({ characterId: charId, guildId: v.guildId, exp: Math.floor(v.expPending) });
  }
  pendingContrib.clear();
  if (batch.length === 0) return;

  // 삭제된 캐릭의 pending 이 남아있으면 FK 위반으로 batch 전체가 실패함.
  // characters 존재 여부 사전 검증 — 없는 char 는 batch에서 제외 + 캐시 무효화.
  try {
    const ids = batch.map(b => b.characterId);
    const exR = await query<{ id: number }>(
      'SELECT id FROM characters WHERE id = ANY($1::int[])', [ids]
    );
    const exists = new Set(exR.rows.map(r => Number(r.id)));
    const missing = batch.filter(b => !exists.has(b.characterId));
    if (missing.length > 0) {
      for (const m of missing) {
        memberGuildCache.delete(m.characterId);
      }
      console.warn(`[guild-contrib-flush] 삭제된 캐릭 ${missing.length}건 제외 (id: ${missing.map(m => m.characterId).join(',')})`);
    }
    const valid = batch.filter(b => exists.has(b.characterId));
    if (valid.length === 0) return;

    const values: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const b of valid) {
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

// ── 길드장 자동 인계 ──
// 길드장이 LEADER_INACTIVE_DAYS 일 이상 미접속이면 자동 위임.
// 후계자 우선순위: 활동 중(3일 이내 접속) 부길드장(officer) → 없거나 부길드장도 미접이면 활동 중 일반 멤버.
//   (둘 다 3일 이내 접속 필수 — 더 비활성인 사람에게 넘기지 않음. 활동자 없으면 스킵.)
//   officer 다수면 최근 접속순, member 동점이면 기여 exp 높은 순.
// ※ 현재 부길드장 임명 기능 미구현(officer 0명) → 사실상 활동 멤버로 동작. officer 생기면 자동 우선.
// 구·신 길드장에게 메일 통보. 매시간 + 시작 직후 1회 실행 (index.ts).
export const LEADER_INACTIVE_DAYS = 3;

export async function autoTransferInactiveLeaders(): Promise<void> {
  let scan;
  try {
    scan = await query<{ guild_id: number; guild_name: string; leader_id: number; leader_name: string }>(
      `SELECT g.id AS guild_id, g.name AS guild_name, g.leader_id, c.name AS leader_name
         FROM guilds g
         JOIN characters c ON c.id = g.leader_id
        WHERE g.leader_id IS NOT NULL
          AND c.last_online_at IS NOT NULL
          AND c.last_online_at < NOW() - ($1 || ' days')::interval`,
      [String(LEADER_INACTIVE_DAYS)]
    );
  } catch (e) {
    console.error('[guild-auto-succession] scan err', e);
    return;
  }

  for (const g of scan.rows) {
    try {
      // 후계자: 활동 중(3일 이내) 부길드장 우선 → 활동 중 일반 멤버. 활동자 없으면 스킵.
      const sr = await query<{ character_id: number; name: string; role: string }>(
        `SELECT gm.character_id, c.name, gm.role
           FROM guild_members gm
           JOIN characters c ON c.id = gm.character_id
           LEFT JOIN guild_contributions gc ON gc.guild_id = gm.guild_id AND gc.character_id = gm.character_id
          WHERE gm.guild_id = $1
            AND gm.role IN ('officer', 'member')
            AND c.last_online_at IS NOT NULL
            AND c.last_online_at >= NOW() - ($2 || ' days')::interval
          ORDER BY (gm.role = 'officer') DESC, c.last_online_at DESC, COALESCE(gc.exp_contributed, 0) DESC
          LIMIT 1`,
        [g.guild_id, String(LEADER_INACTIVE_DAYS)]
      );
      if (sr.rowCount === 0) continue; // 활동 중인 부길드장·멤버 없음 → 스킵
      const successor = sr.rows[0];

      // 트랜잭션 + 락 + 재확인 (락 사이에 길드장이 재접속/이미 교체됐을 수 있음)
      const transferred = await withTransaction(async (tx) => {
        const chk = await tx.query<{ leader_id: number; inactive: boolean }>(
          `SELECT g.leader_id, (c.last_online_at < NOW() - ($2 || ' days')::interval) AS inactive
             FROM guilds g JOIN characters c ON c.id = g.leader_id
            WHERE g.id = $1 FOR UPDATE`,
          [g.guild_id, String(LEADER_INACTIVE_DAYS)]
        );
        if (chk.rowCount === 0) return false;
        if (chk.rows[0].leader_id !== g.leader_id) return false; // 이미 길드장 변경됨
        if (!chk.rows[0].inactive) return false;                 // 길드장 재접속함
        await tx.query(`UPDATE guild_members SET role = 'member' WHERE character_id = $1 AND guild_id = $2`, [g.leader_id, g.guild_id]);
        await tx.query(`UPDATE guild_members SET role = 'leader' WHERE character_id = $1 AND guild_id = $2`, [successor.character_id, g.guild_id]);
        await tx.query(`UPDATE guilds SET leader_id = $1 WHERE id = $2`, [successor.character_id, g.guild_id]);
        return true;
      });
      if (!transferred) continue;

      // 구·신 길드장 메일 통보
      const subject = '길드장 자동 인계';
      await query(
        `INSERT INTO mailbox (character_id, subject, body) VALUES ($1, $2, $3)`,
        [g.leader_id, subject, `${LEADER_INACTIVE_DAYS}일 이상 미접속으로 [${g.guild_name}] 길드장이 ${successor.name} 님에게 자동 위임되었습니다.`]
      );
      await query(
        `INSERT INTO mailbox (character_id, subject, body) VALUES ($1, $2, $3)`,
        [successor.character_id, subject, `전 길드장(${g.leader_name})의 장기 미접속으로 [${g.guild_name}]의 새 길드장이 되었습니다.`]
      );
      console.log(`[guild-auto-succession] ${g.guild_name}: ${g.leader_name}(${g.leader_id}) → ${successor.name}(${successor.character_id})`);
    } catch (e) {
      console.error('[guild-auto-succession] transfer err guild=' + g.guild_id, e);
    }
  }
}
