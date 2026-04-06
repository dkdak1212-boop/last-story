import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';

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

  const r = await query<{ guild_id: number | null; role: string | null; name: string | null; description: string | null; leader_id: number | null; max_members: number | null; stat_buff_pct: number | null }>(
    `SELECT gm.guild_id, gm.role, g.name, g.description, g.leader_id, g.max_members, g.stat_buff_pct
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

  res.json({
    guild: {
      id: g.guild_id, name: g.name, description: g.description,
      isLeader: g.leader_id === cid, role: g.role,
      maxMembers: g.max_members, statBuffPct: Number(g.stat_buff_pct),
      members: mr.rows.map(m => ({ id: m.character_id, name: m.name, level: m.level, className: m.class_name, role: m.role })),
    },
  });
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

export default router;
