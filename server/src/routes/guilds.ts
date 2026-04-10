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
} from '../game/guild.js';
import {
  getCurrentWeekStart, settleTerritoriesNow,
  TERRITORY_EXP_BONUS_PCT, TERRITORY_DROP_BONUS_PCT, MIN_OCCUPATION_SCORE,
} from '../game/territory.js';

const router = Router();
router.use(authRequired);

const GUILD_COST = 5000;

// 길드 목록
router.get('/', async (_req, res) => {
  const r = await query<{ id: number; name: string; description: string; member_count: string; leader_name: string; max_members: number; stat_buff_pct: number }>(
    `SELECT g.id, g.name, g.description, g.max_members, g.stat_buff_pct,
            (SELECT COUNT(*) FROM guild_members gm WHERE gm.guild_id = g.id)::text AS member_count,
            c.name AS leader_name
     FROM guilds g JOIN characters c ON c.id = g.leader_id
     ORDER BY member_count DESC, g.created_at ASC LIMIT 100`
  );
  res.json(r.rows.map(row => ({
    id: row.id, name: row.name, description: row.description,
    memberCount: Number(row.member_count), leaderName: row.leader_name,
    maxMembers: row.max_members, statBuffPct: Number(row.stat_buff_pct),
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
  if (r.rowCount === 0) return res.json({ guild: null });
  const g = r.rows[0];

  const mr = await query<{ character_id: number; role: string; name: string; level: number; class_name: string }>(
    `SELECT gm.character_id, gm.role, c.name, c.level, c.class_name
     FROM guild_members gm JOIN characters c ON c.id = gm.character_id
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
      members: mr.rows.map(m => ({ id: m.character_id, name: m.name, level: m.level, className: m.class_name, role: m.role })),
    },
  });
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

  await query('UPDATE characters SET gold = gold - $1 WHERE id = $2', [parsed.data.amount, char.id]);
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

  await query('UPDATE guilds SET treasury = treasury - $1 WHERE id = $2', [cost, guildId]);
  await query(
    `INSERT INTO guild_skills (guild_id, skill_key, level) VALUES ($1, $2, $3)
     ON CONFLICT (guild_id, skill_key) DO UPDATE SET level = $3`,
    [guildId, parsed.data.skillKey, next]
  );
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

  // 이름 중복
  const dup = await query('SELECT 1 FROM guilds WHERE name = $1', [parsed.data.name]);
  if (dup.rowCount && dup.rowCount > 0) return res.status(409).json({ error: 'name taken' });

  const g = await query<{ id: number }>(
    'INSERT INTO guilds (name, description, leader_id) VALUES ($1, $2, $3) RETURNING id',
    [parsed.data.name, parsed.data.description, char.id]
  );
  await query(
    `INSERT INTO guild_members (guild_id, character_id, role) VALUES ($1, $2, 'leader')`,
    [g.rows[0].id, char.id]
  );
  await query('UPDATE characters SET gold = gold - $1 WHERE id = $2', [GUILD_COST, char.id]);
  res.json({ ok: true, guildId: g.rows[0].id });
});

// 길드 가입
router.post('/:guildId/join', async (req: AuthedRequest, res: Response) => {
  const guildId = Number(req.params.guildId);
  const parsed = z.object({ characterId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const char = await loadCharacterOwned(parsed.data.characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const ex = await query('SELECT 1 FROM guild_members WHERE character_id = $1', [char.id]);
  if (ex.rowCount && ex.rowCount > 0) return res.status(400).json({ error: 'already in guild' });

  const g = await query<{ max_members: number; count: string }>(
    `SELECT g.max_members, (SELECT COUNT(*) FROM guild_members WHERE guild_id=g.id)::text AS count
     FROM guilds g WHERE g.id = $1`,
    [guildId]
  );
  if (g.rowCount === 0) return res.status(404).json({ error: 'guild not found' });
  if (Number(g.rows[0].count) >= g.rows[0].max_members) return res.status(400).json({ error: 'guild full' });

  await query('INSERT INTO guild_members (guild_id, character_id) VALUES ($1, $2)', [guildId, char.id]);
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
  await query('DELETE FROM guilds WHERE id = $1', [r.rows[0].guild_id]);
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
