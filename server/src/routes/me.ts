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
        'world_event_participants', 'premium_purchases',
      ];
      for (const t of cleanupTables) {
        try { await query(`DELETE FROM ${t} WHERE character_id = ANY($1::int[])`, [charIds]); } catch { /* table or column missing */ }
      }
      // auctions: 판매중이면 삭제, 입찰자면 NULL 처리 (FK NOT NULL)
      try { await query(`DELETE FROM auctions WHERE seller_id = ANY($1::int[])`, [charIds]); } catch { /* ignore */ }
      try { await query(`UPDATE auctions SET current_bidder_id = NULL WHERE current_bidder_id = ANY($1::int[])`, [charIds]); } catch { /* ignore */ }
      // party_invites: from/to 양쪽
      try { await query(`DELETE FROM party_invites WHERE to_id = ANY($1::int[]) OR from_id = ANY($1::int[])`, [charIds]); } catch { /* ignore */ }
      // pvp_battles.winner_id 는 SET NULL
      try { await query(`UPDATE pvp_battles SET winner_id = NULL WHERE winner_id = ANY($1::int[])`, [charIds]); } catch { /* ignore */ }
      // guilds.leader_id — 캐릭터가 길드장이면 해당 길드 자체 삭제 (leader_id 는 NOT NULL)
      try {
        const gr = await query<{ id: number }>(`SELECT id FROM guilds WHERE leader_id = ANY($1::int[])`, [charIds]);
        if (gr.rowCount && gr.rowCount > 0) {
          const gids = gr.rows.map(r => r.id);
          await query(`DELETE FROM guild_members WHERE guild_id = ANY($1::int[])`, [gids]);
          await query(`DELETE FROM guilds WHERE id = ANY($1::int[])`, [gids]);
        }
      } catch { /* ignore */ }
    }
    const userCleanup = ['user_login_log', 'premium_purchases'];
    for (const t of userCleanup) {
      try { await query(`DELETE FROM ${t} WHERE user_id = $1`, [userId]); } catch { /* ignore */ }
    }
    await query('DELETE FROM users WHERE id = $1', [userId]);
    // auth 캐시 정리 — SERIAL 재사용 시 구 created_at 가 남아있으면 오판 가능
    try {
      const { invalidateUserCreatedAtCache } = await import('../middleware/auth.js');
      invalidateUserCreatedAtCache(userId);
    } catch { /* ignore */ }
    res.json({ ok: true, deletedUser: chk.rows[0].username });
  } catch (e) {
    console.error('[me] self-delete err', e);
    res.status(500).json({ error: String(e).slice(0, 300) });
  }
});

export default router;
