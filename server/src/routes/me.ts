import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

// 로그인 유저 정보 (관리자 여부 포함)
router.get('/', async (req: AuthedRequest, res) => {
  const r = await query<{ id: number; username: string; is_admin: boolean; premium_until: string | null; max_character_slots: number }>(
    `SELECT id, username, is_admin, premium_until, max_character_slots FROM users WHERE id = $1`,
    [req.userId]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });
  res.json({
    id: r.rows[0].id,
    username: r.rows[0].username,
    isAdmin: r.rows[0].is_admin,
    premiumUntil: r.rows[0].premium_until,
    maxCharacterSlots: r.rows[0].max_character_slots,
  });
});

export default router;
