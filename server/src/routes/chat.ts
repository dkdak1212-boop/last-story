import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

// 채팅 히스토리 (채널별 최근 50개)
router.get('/history', async (req, res) => {
  const channel = ((req.query.channel as string) || 'global').replace(/[^a-z]/g, '');
  const scopeId = req.query.scopeId ? Number(req.query.scopeId) : null;
  if (!['global', 'trade', 'guild', 'party'].includes(channel)) {
    return res.status(400).json({ error: 'invalid channel' });
  }
  let r;
  if (channel === 'guild' || channel === 'party') {
    if (!scopeId) return res.json([]);
    r = await query<{ id: number; from_name: string; text: string; created_at: string }>(
      `SELECT id, from_name, text, created_at FROM chat_messages
       WHERE channel = $1 AND scope_id = $2 ORDER BY created_at DESC LIMIT 50`,
      [channel, scopeId]
    );
  } else {
    r = await query<{ id: number; from_name: string; text: string; created_at: string }>(
      `SELECT id, from_name, text, created_at FROM chat_messages
       WHERE channel = $1 ORDER BY created_at DESC LIMIT 50`,
      [channel]
    );
  }
  res.json(r.rows.reverse().map(row => ({
    id: row.id,
    from: row.from_name,
    text: row.text,
    createdAt: row.created_at,
    channel,
  })));
});

export default router;
