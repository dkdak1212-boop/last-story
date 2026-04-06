import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { adminRequired } from '../middleware/admin.js';

const router = Router();
router.use(authRequired);
router.use(adminRequired);

// 서버 통계
router.get('/stats', async (_req, res) => {
  const users = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users');
  const chars = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM characters');
  const active24h = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM characters WHERE last_online_at > NOW() - INTERVAL '24 hours'`
  );
  const guilds = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM guilds');
  const auctions = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM auctions WHERE settled = FALSE AND cancelled = FALSE`
  );
  const openFeedback = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM feedback WHERE status IN ('open','reviewing')`
  );
  const topLevel = await query<{ name: string; level: number }>(
    `SELECT name, level FROM characters ORDER BY level DESC LIMIT 1`
  );
  const topGold = await query<{ name: string; gold: string }>(
    `SELECT name, gold FROM characters ORDER BY gold DESC LIMIT 1`
  );
  res.json({
    totalUsers: Number(users.rows[0].count),
    totalCharacters: Number(chars.rows[0].count),
    active24h: Number(active24h.rows[0].count),
    totalGuilds: Number(guilds.rows[0].count),
    openAuctions: Number(auctions.rows[0].count),
    openFeedback: Number(openFeedback.rows[0].count),
    topLevel: topLevel.rows[0] ? `${topLevel.rows[0].name} (Lv.${topLevel.rows[0].level})` : '—',
    topGold: topGold.rows[0] ? `${topGold.rows[0].name} (${Number(topGold.rows[0].gold).toLocaleString()}G)` : '—',
  });
});

// === 공지 관리 ===
router.get('/announcements', async (_req, res) => {
  const r = await query(
    `SELECT a.id, a.title, a.body, a.priority, a.active, a.created_at, a.expires_at,
            u.username AS author
     FROM announcements a LEFT JOIN users u ON u.id = a.author_id
     ORDER BY a.created_at DESC LIMIT 100`
  );
  res.json(r.rows);
});

router.post('/announcements', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    title: z.string().min(1).max(100),
    body: z.string().min(1).max(5000),
    priority: z.enum(['normal', 'important', 'urgent']).default('normal'),
    expiresAt: z.string().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  await query(
    `INSERT INTO announcements (title, body, priority, expires_at, author_id) VALUES ($1, $2, $3, $4, $5)`,
    [parsed.data.title, parsed.data.body, parsed.data.priority, parsed.data.expiresAt ?? null, req.userId]
  );
  res.json({ ok: true });
});

router.post('/announcements/:id/toggle', async (req, res) => {
  const id = Number(req.params.id);
  await query('UPDATE announcements SET active = NOT active WHERE id = $1', [id]);
  res.json({ ok: true });
});

router.post('/announcements/:id/delete', async (req, res) => {
  const id = Number(req.params.id);
  await query('DELETE FROM announcements WHERE id = $1', [id]);
  res.json({ ok: true });
});

// === 피드백 관리 ===
router.get('/feedback', async (req, res) => {
  const status = (req.query.status as string) || '';
  const where = status ? 'WHERE f.status = $1' : '';
  const params = status ? [status] : [];
  const r = await query<{ id: number; category: string; text: string; status: string; admin_note: string | null; created_at: string; username: string; character_name: string | null }>(
    `SELECT f.id, f.category, f.text, f.status, f.admin_note, f.created_at,
            u.username, c.name AS character_name
     FROM feedback f JOIN users u ON u.id = f.user_id
     LEFT JOIN characters c ON c.id = f.character_id
     ${where} ORDER BY f.created_at DESC LIMIT 100`,
    params
  );
  res.json(r.rows);
});

router.post('/feedback/:id/respond', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const parsed = z.object({
    status: z.enum(['open', 'reviewing', 'resolved', 'closed']),
    adminNote: z.string().max(2000).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  await query(
    `UPDATE feedback SET status = $1, admin_note = $2, updated_at = NOW() WHERE id = $3`,
    [parsed.data.status, parsed.data.adminNote ?? null, id]
  );
  res.json({ ok: true });
});

// === 지원 도구: 골드/경험치 부여 ===
router.post('/grant', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    gold: z.number().int().optional(),
    exp: z.number().int().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, gold, exp } = parsed.data;
  if (gold) await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [gold, characterId]);
  if (exp) await query('UPDATE characters SET exp = exp + $1 WHERE id = $2', [exp, characterId]);
  res.json({ ok: true });
});

// is_admin 확인용 엔드포인트 (사용자가 관리자인지 체크)
export default router;
