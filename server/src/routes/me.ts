import { Router, type Response } from 'express';
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

// 본인 계정 탈퇴 — 확인 토큰 필요
router.post('/delete', async (req: AuthedRequest, res: Response) => {
  const confirm = (req.body && typeof req.body === 'object') ? req.body.confirm : null;
  if (confirm !== 'DELETE_MY_ACCOUNT') return res.status(400).json({ error: 'confirm required' });
  const userId = req.userId!;

  // 어드민 계정은 self-delete 차단 (실수 방지)
  const chk = await query<{ is_admin: boolean; username: string }>(
    'SELECT is_admin, username FROM users WHERE id = $1', [userId]
  );
  if (chk.rowCount === 0) return res.status(404).json({ error: 'user not found' });
  if (chk.rows[0].is_admin) return res.status(400).json({ error: '어드민 계정은 탈퇴 불가' });

  try {
    const charR = await query<{ id: number }>('SELECT id FROM characters WHERE user_id = $1', [userId]);
    const charIds = charR.rows.map(r => r.id);
    if (charIds.length > 0) {
      const cleanupTables = [
        'item_drop_log', 'enhance_log', 'guestbook', 'feedback',
        'announcement_reads', 'board_posts', 'board_comments', 'board_reports',
        'pvp_battles', 'pvp_cooldowns', 'guild_boss_runs', 'guild_boss_guild_daily',
        'guild_boss_weekly_settlements', 'guild_boss_shop_purchases',
        'world_event_participants',
      ];
      for (const t of cleanupTables) {
        try { await query(`DELETE FROM ${t} WHERE character_id = ANY($1::int[])`, [charIds]); } catch { /* ignore */ }
      }
    }
    const userCleanup = ['user_login_log', 'premium_purchases'];
    for (const t of userCleanup) {
      try { await query(`DELETE FROM ${t} WHERE user_id = $1`, [userId]); } catch { /* ignore */ }
    }
    await query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ ok: true, deletedUser: chk.rows[0].username });
  } catch (e) {
    console.error('[me] self-delete err', e);
    res.status(500).json({ error: String(e).slice(0, 300) });
  }
});

export default router;
