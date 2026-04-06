import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

// 피드백 제출
router.post('/', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive().optional(),
    category: z.enum(['bug', 'suggestion', 'balance', 'other']),
    text: z.string().min(5).max(2000),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  await query(
    `INSERT INTO feedback (user_id, character_id, category, text) VALUES ($1, $2, $3, $4)`,
    [req.userId, parsed.data.characterId ?? null, parsed.data.category, parsed.data.text]
  );
  res.json({ ok: true });
});

// 내 피드백 목록
router.get('/mine', async (req: AuthedRequest, res: Response) => {
  const r = await query<{ id: number; category: string; text: string; status: string; admin_note: string | null; created_at: string; updated_at: string }>(
    `SELECT id, category, text, status, admin_note, created_at, updated_at
     FROM feedback WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [req.userId]
  );
  res.json(r.rows);
});

export default router;
