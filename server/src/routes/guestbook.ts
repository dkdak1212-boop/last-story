import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';

const router = Router();

// 방명록 목록 (최근 50개)
router.get('/', async (_req, res) => {
  const r = await query(
    `SELECT g.id, g.character_name, g.class_name, g.message, g.created_at
     FROM guestbook g
     JOIN characters c ON c.id = g.character_id
     JOIN users u ON u.id = c.user_id
     WHERE u.is_admin = FALSE
     ORDER BY g.created_at DESC LIMIT 50`
  );
  res.json(r.rows.map(row => ({
    id: row.id,
    characterName: row.character_name,
    className: row.class_name,
    message: row.message,
    createdAt: row.created_at,
  })));
});

// 방명록 작성
router.post('/', authRequired, async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    message: z.string().min(1).max(200),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const { characterId, message } = parsed.data;

  const charR = await query<{ name: string; class_name: string; user_id: number }>(
    'SELECT name, class_name, user_id FROM characters WHERE id = $1', [characterId]
  );
  if (charR.rowCount === 0) return res.status(404).json({ error: 'character not found' });
  if (charR.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'not your character' });

  // 도배 방지: 1분 내 중복 금지
  const recent = await query<{ id: number }>(
    `SELECT id FROM guestbook WHERE character_id = $1 AND created_at > NOW() - INTERVAL '1 minute' LIMIT 1`,
    [characterId]
  );
  if (recent.rowCount && recent.rowCount > 0) return res.status(400).json({ error: '1분에 한 번만 작성할 수 있습니다.' });

  await query(
    'INSERT INTO guestbook (character_id, character_name, class_name, message) VALUES ($1, $2, $3, $4)',
    [characterId, charR.rows[0].name, charR.rows[0].class_name, message]
  );
  res.json({ ok: true });
});

// 방명록 삭제 (본인 또는 관리자)
router.post('/:id/delete', authRequired, async (req: AuthedRequest, res: Response) => {
  const gid = Number(req.params.id);
  const entry = await query<{ character_id: number }>(
    'SELECT character_id FROM guestbook WHERE id = $1', [gid]
  );
  if (entry.rowCount === 0) return res.status(404).json({ error: 'not found' });

  // 본인 캐릭터인지 확인
  const charR = await query<{ user_id: number }>(
    'SELECT user_id FROM characters WHERE id = $1', [entry.rows[0].character_id]
  );
  const isAdmin = await query<{ is_admin: boolean }>('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
  const isOwner = charR.rows[0]?.user_id === req.userId;
  const admin = isAdmin.rows[0]?.is_admin;

  if (!isOwner && !admin) return res.status(403).json({ error: 'no permission' });

  await query('DELETE FROM guestbook WHERE id = $1', [gid]);
  res.json({ ok: true });
});

export default router;
