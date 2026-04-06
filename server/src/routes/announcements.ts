import { Router, type Response } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

// 활성 공지 목록
router.get('/', async (_req, res) => {
  const r = await query<{ id: number; title: string; body: string; priority: string; created_at: string; expires_at: string | null }>(
    `SELECT id, title, body, priority, created_at, expires_at
     FROM announcements
     WHERE active = TRUE AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
              created_at DESC LIMIT 50`
  );
  res.json(r.rows);
});

// 미확인 공지 (팝업용)
router.get('/unread', async (req: AuthedRequest, res: Response) => {
  const r = await query<{ id: number; title: string; body: string; priority: string; created_at: string }>(
    `SELECT a.id, a.title, a.body, a.priority, a.created_at
     FROM announcements a
     WHERE a.active = TRUE AND (a.expires_at IS NULL OR a.expires_at > NOW())
       AND NOT EXISTS (SELECT 1 FROM announcement_reads ar WHERE ar.user_id = $1 AND ar.announcement_id = a.id)
     ORDER BY a.created_at DESC LIMIT 5`,
    [req.userId]
  );
  res.json(r.rows);
});

// 공지 읽음 처리
router.post('/:id/read', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  await query(
    `INSERT INTO announcement_reads (user_id, announcement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.userId, id]
  );
  res.json({ ok: true });
});

export default router;
