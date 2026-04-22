import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import {
  GUILD_SKILL_KEYS, GUILD_SKILL_PCT, GUILD_SKILL_MAX, GUILD_SKILL_LABEL,
  GUILD_MAX_LEVEL, DAILY_DONATION_CAP,
  expToNextGuild, getGuildSkillUpgradeCost, getGuildSkillReqLevel,
  invalidateGuildSkillCache,
  setMemberGuild, clearMemberGuild,
} from '../game/guild.js';
import {
  getCurrentWeekStart, settleTerritoriesNow,
  TERRITORY_EXP_BONUS_PCT, TERRITORY_DROP_BONUS_PCT, MIN_OCCUPATION_SCORE,
} from '../game/territory.js';

const router = Router();
router.use(authRequired);

// 길드 탈퇴 후 재가입·생성 쿨타임 체크 — 활성 시 남은 ms 반환, 아니면 0
async function getGuildCooldownRemainingMs(characterId: number): Promise<number> {
  const r = await query<{ until: string | null }>(
    'SELECT guild_cooldown_until::text AS until FROM characters WHERE id = $1', [characterId]
  );
  const until = r.rows[0]?.until;
  if (!until) return 0;
  const diff = new Date(until).getTime() - Date.now();
  return diff > 0 ? diff : 0;
}

function formatCooldownMsg(remainingMs: number): string {
  const h = Math.floor(remainingMs / 3_600_000);
  const m = Math.floor((remainingMs % 3_600_000) / 60_000);
  if (h > 0) return `길드 탈퇴 쿨타임 중입니다 (${h}시간 ${m}분 남음)`;
  return `길드 탈퇴 쿨타임 중입니다 (${m}분 남음)`;
}

const GUILD_COST = 100000;

// 길드 목록
router.get('/', async (_req, res) => {
  const r = await query<{
    id: number; name: string; description: string; member_count: number;
    leader_name: string; max_members: number; stat_buff_pct: number;
    level: number; exp: string; level_sum: number;
    skill_gold: number; skill_exp: number; skill_drop: number; skill_hp: number;
  }>(
    `SELECT * FROM (
       SELECT g.id, g.name, g.description, g.max_members, g.stat_buff_pct, g.level, g.exp,
              COALESCE((SELECT COUNT(*)::int FROM guild_members gm WHERE gm.guild_id = g.id), 0) AS member_count,
              COALESCE((SELECT SUM(c2.level)::bigint FROM guild_members gm2 JOIN characters c2 ON c2.id = gm2.character_id WHERE gm2.guild_id = g.id), 0) AS level_sum,
              c.name AS leader_name,
              g.created_at,
              COALESCE((SELECT level FROM guild_skills WHERE guild_id = g.id AND skill_key = 'gold'), 0) AS skill_gold,
              COALESCE((SELECT level FROM guild_skills WHERE guild_id = g.id AND skill_key = 'exp'), 0) AS skill_exp,
              COALESCE((SELECT level FROM guild_skills WHERE guild_id = g.id AND skill_key = 'drop'), 0) AS skill_drop,
              COALESCE((SELECT level FROM guild_skills WHERE guild_id = g.id AND skill_key = 'hp'), 0) AS skill_hp
       FROM guilds g JOIN characters c ON c.id = g.leader_id
     ) x
     ORDER BY level_sum DESC, member_count DESC, created_at ASC LIMIT 100`
  );
  res.json(r.rows.map(row => ({
    id: row.id, name: row.name, description: row.description,
    memberCount: Number(row.member_count), leaderName: row.leader_name,
    maxMembers: row.max_members, statBuffPct: Number(row.stat_buff_pct),
    level: row.level, exp: Number(row.exp),
    levelSum: Number(row.level_sum),
    skills: { gold: row.skill_gold, exp: row.skill_exp, drop: row.skill_drop, hp: row.skill_hp },
  })));
});

// 내 길드 정보
router.get('/my/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const r = await query<{ guild_id: number | null; role: string | null; name: string | null; description: string | null; leader_id: number | null; max_members: number | null; stat_buff_pct: number | null; level: number | null; exp: string | null; treasury: string | null }>(
    `SELECT gm.guild_id, gm.role, g.name, g.description, g.leader_id, g.max_members, g.stat_buff_pct,
            g.level, g.exp, g.treasury
     FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id
     WHERE gm.character_id = $1`,
    [cid]
  );
  if (r.rowCount === 0) {
    // 길드 없음 — 탈퇴 쿨타임 정보 포함 (UI 카운트다운용)
    const cdMs = await getGuildCooldownRemainingMs(cid);
    return res.json({ guild: null, cooldownMs: cdMs });
  }
  const g = r.rows[0];

  const mr = await query<{
    character_id: number; role: string; name: string; level: number; class_name: string;
    last_online_at: string | null; gold_donated: string | null; today_donation: string | null;
  }>(
    `SELECT gm.character_id, gm.role, c.name, c.level, c.class_name, c.last_online_at,
            COALESCE(gc.gold_donated, 0)::text AS gold_donated,
            COALESCE(
              (SELECT amount FROM guild_donations_daily
                WHERE character_id = gm.character_id AND date = CURRENT_DATE),
              0
            )::text AS today_donation
     FROM guild_members gm
       JOIN characters c ON c.id = gm.character_id
       LEFT JOIN guild_contributions gc ON gc.guild_id = gm.guild_id AND gc.character_id = gm.character_id
     WHERE gm.guild_id = $1 ORDER BY gm.role, gm.joined_at`,
    [g.guild_id]
  );

  // 길드 스킬
  const sr = await query<{ skill_key: string; level: number }>(
    'SELECT skill_key, level FROM guild_skills WHERE guild_id = $1', [g.guild_id]
  );
  const skillMap: Record<string, number> = {};
  for (const row of sr.rows) skillMap[row.skill_key] = row.level;

  const guildLevel = g.level || 1;
  const guildExp = Number(g.exp || 0);
  const skills = GUILD_SKILL_KEYS.map(key => {
    const level = skillMap[key] || 0;
    const next = level + 1;
    return {
      key, label: GUILD_SKILL_LABEL[key],
      level, max: GUILD_SKILL_MAX,
      pctPerLevel: GUILD_SKILL_PCT[key],
      currentPct: level * GUILD_SKILL_PCT[key],
      nextCost: level >= GUILD_SKILL_MAX ? 0 : getGuildSkillUpgradeCost(next),
      nextReqLevel: level >= GUILD_SKILL_MAX ? 0 : getGuildSkillReqLevel(next),
    };
  });

  // 본인 일일 기부량
  const dr = await query<{ amount: string }>(
    `SELECT amount FROM guild_donations_daily WHERE character_id = $1 AND date = CURRENT_DATE`,
    [cid]
  );
  const myDonationToday = Number(dr.rows[0]?.amount || 0);

  res.json({
    guild: {
      id: g.guild_id, name: g.name, description: g.description,
      isLeader: g.leader_id === cid, role: g.role,
      maxMembers: g.max_members, statBuffPct: Number(g.stat_buff_pct),
      level: guildLevel,
      exp: guildExp,
      expToNext: guildLevel >= GUILD_MAX_LEVEL ? 0 : expToNextGuild(guildLevel),
      maxLevel: GUILD_MAX_LEVEL,
      treasury: Number(g.treasury || 0),
      skills,
      myDonationToday,
      dailyDonationCap: DAILY_DONATION_CAP,
      members: mr.rows.map(m => ({
        id: m.character_id, name: m.name, level: m.level, className: m.class_name, role: m.role,
        lastOnlineAt: m.last_online_at,
        goldDonated: Number(m.gold_donated || 0),
        todayDonation: Number(m.today_donation || 0),
      })),
    },
  });
});

// 길드 소개글 수정 (리더만)
router.post('/description', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    description: z.string().max(200).default(''),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const char = await loadCharacterOwned(parsed.data.characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const gm = await query<{ guild_id: number; role: string }>(
    'SELECT guild_id, role FROM guild_members WHERE character_id = $1', [char.id]
  );
  if (gm.rowCount === 0) return res.status(400).json({ error: '길드 없음' });
  if (gm.rows[0].role !== 'leader') return res.status(403).json({ error: '리더만 수정 가능' });

  await query('UPDATE guilds SET description = $1 WHERE id = $2', [parsed.data.description, gm.rows[0].guild_id]);
  res.json({ ok: true });
});

// 길드 자금 기부
router.post('/donate', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    amount: z.number().int().min(1).max(DAILY_DONATION_CAP),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const char = await loadCharacterOwned(parsed.data.characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  if (char.gold < parsed.data.amount) return res.status(400).json({ error: '골드 부족' });

  const gm = await query<{ guild_id: number }>(
    'SELECT guild_id FROM guild_members WHERE character_id = $1', [char.id]
  );
  if (gm.rowCount === 0) return res.status(400).json({ error: '길드 없음' });
  const guildId = gm.rows[0].guild_id;

  // 일일 한도 체크
  const dr = await query<{ amount: string }>(
    `SELECT amount FROM guild_donations_daily WHERE character_id = $1 AND date = CURRENT_DATE`,
    [char.id]
  );
  const todaySoFar = Number(dr.rows[0]?.amount || 0);
  if (todaySoFar + parsed.data.amount > DAILY_DONATION_CAP) {
    return res.status(400).json({ error: `일일 기부 한도 초과 (오늘 ${todaySoFar.toLocaleString()}/${DAILY_DONATION_CAP.toLocaleString()}G)` });
  }

  // 원자적 차감 — 동시 소비 시 음수/재소비 방지
  const deductR = await query(
    'UPDATE characters SET gold = gold - $1 WHERE id = $2 AND gold >= $1',
    [parsed.data.amount, char.id]
  );
  if (deductR.rowCount === 0) return res.status(400).json({ error: '골드가 부족합니다.' });
  await query('UPDATE guilds SET treasury = treasury + $1 WHERE id = $2', [parsed.data.amount, guildId]);

  await query(
    `INSERT INTO guild_donations_daily (character_id, date, amount)
     VALUES ($1, CURRENT_DATE, $2)
     ON CONFLICT (character_id) DO UPDATE
       SET date = CURRENT_DATE,
           amount = CASE WHEN guild_donations_daily.date = CURRENT_DATE
                         THEN guild_donations_daily.amount + $2
                         ELSE $2 END`,
    [char.id, parsed.data.amount]
  );

  await query(
    `INSERT INTO guild_contributions (guild_id, character_id, exp_contributed, gold_donated)
     VALUES ($1, $2, 0, $3)
     ON CONFLICT (guild_id, character_id) DO UPDATE
       SET gold_donated = guild_contributions.gold_donated + $3`,
    [guildId, char.id, parsed.data.amount]
  );

  res.json({ ok: true });
});

// 길드 스킬 업그레이드 (리더 전용)
router.post('/skill/upgrade', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    skillKey: z.enum(GUILD_SKILL_KEYS),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const char = await loadCharacterOwned(parsed.data.characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const gm = await query<{ guild_id: number; role: string }>(
    'SELECT guild_id, role FROM guild_members WHERE character_id = $1', [char.id]
  );
  if (gm.rowCount === 0) return res.status(400).json({ error: '길드 없음' });
  if (gm.rows[0].role !== 'leader') return res.status(403).json({ error: '리더만 업그레이드 가능' });
  const guildId = gm.rows[0].guild_id;

  const gr = await query<{ level: number; treasury: string }>(
    'SELECT level, treasury FROM guilds WHERE id = $1', [guildId]
  );
  if (gr.rowCount === 0) return res.status(404).json({ error: 'guild not found' });
  const guildLevel = gr.rows[0].level;
  const treasury = Number(gr.rows[0].treasury);

  const sr = await query<{ level: number }>(
    'SELECT level FROM guild_skills WHERE guild_id = $1 AND skill_key = $2',
    [guildId, parsed.data.skillKey]
  );
  const currentLevel = sr.rows[0]?.level || 0;
  if (currentLevel >= GUILD_SKILL_MAX) return res.status(400).json({ error: '최대 단계' });

  const next = currentLevel + 1;
  const cost = getGuildSkillUpgradeCost(next);
  const reqLv = getGuildSkillReqLevel(next);
  if (guildLevel < reqLv) return res.status(400).json({ error: `길드 레벨 ${reqLv} 이상 필요` });
  if (treasury < cost) return res.status(400).json({ error: `자금 부족 (필요: ${cost.toLocaleString()}G)` });

  // 원자적 자금 차감 — 동시 업그레이드 시 중복 소비 방지
  const deductR = await query(
    'UPDATE guilds SET treasury = treasury - $1 WHERE id = $2 AND treasury >= $1',
    [cost, guildId]
  );
  if (deductR.rowCount === 0) return res.status(400).json({ error: '자금이 부족합니다.' });
  // 단계 업그레이드 — 현재 단계 조건부로만 적용 (동시 요청 방어)
  const upR = await query(
    `INSERT INTO guild_skills (guild_id, skill_key, level) VALUES ($1, $2, $3)
     ON CONFLICT (guild_id, skill_key) DO UPDATE SET level = $3
     WHERE guild_skills.level = $3 - 1`,
    [guildId, parsed.data.skillKey, next]
  );
  if (upR.rowCount === 0) {
    // 경쟁 조건 — 업그레이드 실패. 자금 롤백.
    await query('UPDATE guilds SET treasury = treasury + $1 WHERE id = $2', [cost, guildId]);
    return res.status(409).json({ error: '동시 업그레이드 충돌. 다시 시도해주세요.' });
  }
  invalidateGuildSkillCache(guildId);

  res.json({ ok: true, newLevel: next });
});

// 길드 생성
router.post('/', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    name: z.string().min(2).max(20),
    description: z.string().max(200).default(''),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const char = await loadCharacterOwned(parsed.data.characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  if (char.gold < GUILD_COST) return res.status(400).json({ error: 'not enough gold' });

  // 이미 길드 있음
  const exists = await query('SELECT 1 FROM guild_members WHERE character_id = $1', [char.id]);
  if (exists.rowCount && exists.rowCount > 0) return res.status(400).json({ error: 'already in guild' });

  // 탈퇴 쿨타임 체크
  const cdMs = await getGuildCooldownRemainingMs(char.id);
  if (cdMs > 0) return res.status(400).json({ error: formatCooldownMsg(cdMs) });

  // 이름 중복
  const dup = await query('SELECT 1 FROM guilds WHERE name = $1', [parsed.data.name]);
  if (dup.rowCount && dup.rowCount > 0) return res.status(409).json({ error: 'name taken' });

  const g = await query<{ id: number }>(
    'INSERT INTO guilds (name, description, leader_id, max_members) VALUES ($1, $2, $3, 20) RETURNING id',
    [parsed.data.name, parsed.data.description, char.id]
  );
  await query(
    `INSERT INTO guild_members (guild_id, character_id, role) VALUES ($1, $2, 'leader')`,
    [g.rows[0].id, char.id]
  );
  setMemberGuild(char.id, g.rows[0].id);
  await query('UPDATE characters SET gold = gold - $1 WHERE id = $2', [GUILD_COST, char.id]);
  res.json({ ok: true, guildId: g.rows[0].id });
});

// 길드 가입 신청 (즉시 가입 X — 길드장 승인 필요)
router.post('/:guildId/apply', async (req: AuthedRequest, res: Response) => {
  const guildId = Number(req.params.guildId);
  const parsed = z.object({ characterId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const char = await loadCharacterOwned(parsed.data.characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const ex = await query('SELECT 1 FROM guild_members WHERE character_id = $1', [char.id]);
  if (ex.rowCount && ex.rowCount > 0) return res.status(400).json({ error: '이미 길드에 가입되어 있습니다' });

  // 탈퇴 쿨타임 체크
  const cdMs = await getGuildCooldownRemainingMs(char.id);
  if (cdMs > 0) return res.status(400).json({ error: formatCooldownMsg(cdMs) });

  const g = await query<{ max_members: number; count: string }>(
    `SELECT g.max_members, (SELECT COUNT(*) FROM guild_members WHERE guild_id=g.id)::text AS count
     FROM guilds g WHERE g.id = $1`,
    [guildId]
  );
  if (g.rowCount === 0) return res.status(404).json({ error: '길드를 찾을 수 없습니다' });
  if (Number(g.rows[0].count) >= g.rows[0].max_members) return res.status(400).json({ error: '길드 정원이 가득 찼습니다' });

  // 이미 신청한 경우
  const dup = await query(
    `SELECT 1 FROM guild_applications WHERE guild_id = $1 AND character_id = $2 AND status = 'pending'`,
    [guildId, char.id]
  );
  if (dup.rowCount && dup.rowCount > 0) return res.status(400).json({ error: '이미 신청 중입니다' });

  await query(
    `INSERT INTO guild_applications (guild_id, character_id, status) VALUES ($1, $2, 'pending')
     ON CONFLICT (guild_id, character_id) DO UPDATE SET status = 'pending', applied_at = NOW()`,
    [guildId, char.id]
  );
  res.json({ ok: true, message: '가입 신청이 접수되었습니다' });
});

// 길드 가입 신청 목록 (길드장만)
router.get('/:guildId/applications', async (req: AuthedRequest, res: Response) => {
  const guildId = Number(req.params.guildId);
  const characterId = Number(req.query.characterId);
  if (!characterId) return res.status(400).json({ error: 'characterId required' });
  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 길드장 권한 체크
  const m = await query<{ role: string }>(
    'SELECT role FROM guild_members WHERE character_id = $1 AND guild_id = $2',
    [characterId, guildId]
  );
  if (m.rowCount === 0 || m.rows[0].role !== 'leader') {
    return res.status(403).json({ error: '길드장만 조회 가능' });
  }

  const apps = await query<{
    id: number; character_id: number; name: string; level: number; class_name: string; applied_at: string;
  }>(
    `SELECT ga.id, ga.character_id, c.name, c.level, c.class_name, ga.applied_at
     FROM guild_applications ga JOIN characters c ON c.id = ga.character_id
     WHERE ga.guild_id = $1 AND ga.status = 'pending'
     ORDER BY ga.applied_at ASC`,
    [guildId]
  );
  res.json({ applications: apps.rows });
});

// 신청 승인
router.post('/applications/:appId/approve', async (req: AuthedRequest, res: Response) => {
  const appId = Number(req.params.appId);
  const parsed = z.object({ characterId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const char = await loadCharacterOwned(parsed.data.characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const ar = await query<{ guild_id: number; character_id: number; status: string }>(
    'SELECT guild_id, character_id, status FROM guild_applications WHERE id = $1',
    [appId]
  );
  if (ar.rowCount === 0) return res.status(404).json({ error: '신청 없음' });
  const app = ar.rows[0];
  if (app.status !== 'pending') return res.status(400).json({ error: '이미 처리됨' });

  // 길드장 권한 체크
  const m = await query<{ role: string }>(
    'SELECT role FROM guild_members WHERE character_id = $1 AND guild_id = $2',
    [parsed.data.characterId, app.guild_id]
  );
  if (m.rowCount === 0 || m.rows[0].role !== 'leader') {
    return res.status(403).json({ error: '길드장만 가능' });
  }

  // 정원 체크
  const g = await query<{ max_members: number; count: string }>(
    `SELECT g.max_members, (SELECT COUNT(*) FROM guild_members WHERE guild_id=g.id)::text AS count
     FROM guilds g WHERE g.id = $1`,
    [app.guild_id]
  );
  if (Number(g.rows[0].count) >= g.rows[0].max_members) {
    return res.status(400).json({ error: '길드 정원이 가득 찼습니다' });
  }

  // 이미 다른 길드 가입 체크
  const ex = await query('SELECT 1 FROM guild_members WHERE character_id = $1', [app.character_id]);
  if (ex.rowCount && ex.rowCount > 0) {
    await query("UPDATE guild_applications SET status = 'rejected' WHERE id = $1", [appId]);
    return res.status(400).json({ error: '신청자가 이미 다른 길드에 가입되어 있습니다' });
  }

  // 신청자의 탈퇴 쿨타임 체크 (신청은 쿨타임 체크를 통과했으나 그 뒤 쿨타임이 새로 걸린 경우 방어)
  const cdMs = await getGuildCooldownRemainingMs(app.character_id);
  if (cdMs > 0) {
    await query("UPDATE guild_applications SET status = 'rejected' WHERE id = $1", [appId]);
    return res.status(400).json({ error: `신청자 ${formatCooldownMsg(cdMs)}` });
  }

  await query('INSERT INTO guild_members (guild_id, character_id) VALUES ($1, $2)', [app.guild_id, app.character_id]);
  setMemberGuild(app.character_id, app.guild_id);
  await query("UPDATE guild_applications SET status = 'approved' WHERE id = $1", [appId]);
  // 같은 캐릭터의 다른 길드 신청은 자동 거절
  await query("UPDATE guild_applications SET status = 'rejected' WHERE character_id = $1 AND status = 'pending'", [app.character_id]);
  res.json({ ok: true });
});

// 신청 거절
router.post('/applications/:appId/reject', async (req: AuthedRequest, res: Response) => {
  const appId = Number(req.params.appId);
  const parsed = z.object({ characterId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const char = await loadCharacterOwned(parsed.data.characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const ar = await query<{ guild_id: number; status: string }>(
    'SELECT guild_id, status FROM guild_applications WHERE id = $1', [appId]
  );
  if (ar.rowCount === 0) return res.status(404).json({ error: '신청 없음' });
  if (ar.rows[0].status !== 'pending') return res.status(400).json({ error: '이미 처리됨' });

  const m = await query<{ role: string }>(
    'SELECT role FROM guild_members WHERE character_id = $1 AND guild_id = $2',
    [parsed.data.characterId, ar.rows[0].guild_id]
  );
  if (m.rowCount === 0 || m.rows[0].role !== 'leader') {
    return res.status(403).json({ error: '길드장만 가능' });
  }

  await query("UPDATE guild_applications SET status = 'rejected' WHERE id = $1", [appId]);
  res.json({ ok: true });
});

// 길드원 추방 (길드장만, 본인 제외)
router.post('/kick', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    leaderCharacterId: z.number().int().positive(),
    targetCharacterId: z.number().int().positive(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { leaderCharacterId, targetCharacterId } = parsed.data;
  if (leaderCharacterId === targetCharacterId) return res.status(400).json({ error: '본인은 추방할 수 없습니다' });

  const leader = await loadCharacterOwned(leaderCharacterId, req.userId!);
  if (!leader) return res.status(404).json({ error: 'not found' });

  const lm = await query<{ guild_id: number; role: string }>(
    'SELECT guild_id, role FROM guild_members WHERE character_id = $1', [leaderCharacterId]
  );
  if (lm.rowCount === 0 || lm.rows[0].role !== 'leader') {
    return res.status(403).json({ error: '길드장만 추방 가능' });
  }

  const tm = await query<{ guild_id: number; role: string }>(
    'SELECT guild_id, role FROM guild_members WHERE character_id = $1', [targetCharacterId]
  );
  if (tm.rowCount === 0 || tm.rows[0].guild_id !== lm.rows[0].guild_id) {
    return res.status(400).json({ error: '같은 길드원이 아닙니다' });
  }

  await query('DELETE FROM guild_members WHERE character_id = $1', [targetCharacterId]);
  clearMemberGuild(targetCharacterId);
  res.json({ ok: true });
});

// 길드 탈퇴
router.post('/leave/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const r = await query<{ guild_id: number; role: string }>(
    'SELECT guild_id, role FROM guild_members WHERE character_id = $1', [cid]
  );
  if (r.rowCount === 0) return res.status(400).json({ error: 'not in guild' });

  if (r.rows[0].role === 'leader') {
    const mc = await query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM guild_members WHERE guild_id = $1', [r.rows[0].guild_id]
    );
    if (Number(mc.rows[0].count) > 1) return res.status(400).json({ error: 'leader must disband or transfer first' });
    // 혼자면 길드 해산
    await query('DELETE FROM guilds WHERE id = $1', [r.rows[0].guild_id]);
  }
  await query('DELETE FROM guild_members WHERE character_id = $1', [cid]);
  clearMemberGuild(cid);
  // 탈퇴 쿨타임 24시간 — 즉시 재가입/생성 방지
  await query(
    `UPDATE characters SET guild_cooldown_until = NOW() + INTERVAL '24 hours' WHERE id = $1`,
    [cid]
  );
  res.json({ ok: true });
});

// 길드 해산
router.post('/disband/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const r = await query<{ guild_id: number; role: string }>(
    'SELECT guild_id, role FROM guild_members WHERE character_id = $1', [cid]
  );
  if (r.rowCount === 0) return res.status(400).json({ error: 'not in guild' });
  if (r.rows[0].role !== 'leader') return res.status(403).json({ error: 'not leader' });
  // 해산 전 멤버 전원 조회 — 길드 삭제 후 CASCADE 로 guild_members 가 지워지기 전에 캐시 invalidate 목록 확보
  const gid = r.rows[0].guild_id;
  const members = await query<{ character_id: number }>(
    'SELECT character_id FROM guild_members WHERE guild_id = $1', [gid]
  );
  await query('DELETE FROM guilds WHERE id = $1', [gid]);
  for (const m of members.rows) clearMemberGuild(m.character_id);
  res.json({ ok: true });
});

// === 영토 점령전 ===

// 모든 필드 + 점령자 + 이번 주 1위
router.get('/territories', async (_req: AuthedRequest, res: Response) => {
  const week = getCurrentWeekStart();
  const fr = await query<{ id: number; name: string; required_level: number }>(
    'SELECT id, name, required_level FROM fields ORDER BY id'
  );
  const tr = await query<{ field_id: number; owner_guild_id: number | null; owner_name: string | null; occupied_at: string | null }>(
    `SELECT t.field_id, t.owner_guild_id, g.name AS owner_name, t.occupied_at
     FROM guild_territories t LEFT JOIN guilds g ON g.id = t.owner_guild_id`
  );
  const ownerMap = new Map<number, { id: number | null; name: string | null; at: string | null }>();
  for (const r of tr.rows) ownerMap.set(r.field_id, { id: r.owner_guild_id, name: r.owner_name, at: r.occupied_at });

  // 이번 주 모든 점수 (1위만)
  const sr = await query<{ field_id: number; guild_id: number; guild_name: string; score: string }>(
    `SELECT s.field_id, s.guild_id, g.name AS guild_name, s.score
     FROM guild_territory_scores s JOIN guilds g ON g.id = s.guild_id
     WHERE s.week_start = $1::date
     ORDER BY s.field_id, s.score DESC`,
    [week]
  );
  const topMap = new Map<number, { guildId: number; guildName: string; score: number }>();
  for (const r of sr.rows) {
    if (!topMap.has(r.field_id)) topMap.set(r.field_id, { guildId: r.guild_id, guildName: r.guild_name, score: Number(r.score) });
  }

  res.json({
    weekStart: week,
    expBonusPct: TERRITORY_EXP_BONUS_PCT,
    dropBonusPct: TERRITORY_DROP_BONUS_PCT,
    minScore: MIN_OCCUPATION_SCORE,
    fields: fr.rows.map(f => {
      const owner = ownerMap.get(f.id);
      const top = topMap.get(f.id);
      return {
        fieldId: f.id, fieldName: f.name, requiredLevel: f.required_level,
        ownerGuildId: owner?.id ?? null,
        ownerGuildName: owner?.name ?? null,
        occupiedAt: owner?.at ?? null,
        weekTopGuildId: top?.guildId ?? null,
        weekTopGuildName: top?.guildName ?? null,
        weekTopScore: top?.score ?? 0,
      };
    }),
  });
});

// 내 길드의 필드별 점수/순위
router.get('/territories/my/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const gm = await query<{ guild_id: number }>('SELECT guild_id FROM guild_members WHERE character_id = $1', [cid]);
  if (gm.rowCount === 0) return res.json({ scores: [] });
  const guildId = gm.rows[0].guild_id;
  const week = getCurrentWeekStart();

  const r = await query<{ field_id: number; score: string; rank: string }>(
    `SELECT s.field_id, s.score,
            (SELECT COUNT(*) FROM guild_territory_scores s2
             WHERE s2.field_id = s.field_id AND s2.week_start = s.week_start AND s2.score > s.score)::text AS rank
     FROM guild_territory_scores s
     WHERE s.guild_id = $1 AND s.week_start = $2::date
     ORDER BY s.field_id`,
    [guildId, week]
  );
  res.json({
    scores: r.rows.map(row => ({
      fieldId: row.field_id,
      score: Number(row.score),
      rank: Number(row.rank) + 1,
    })),
  });
});

// 관리자 강제 결산 (테스트용)
router.post('/territories/settle-now', async (req: AuthedRequest, res: Response) => {
  const ur = await query<{ username: string }>('SELECT username FROM users WHERE id = $1', [req.userId!]);
  if (ur.rows[0]?.username !== 'admin') return res.status(403).json({ error: 'admin only' });
  await settleTerritoriesNow();
  res.json({ ok: true });
});

export default router;
