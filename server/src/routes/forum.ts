import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, optionalAuth, type AuthedRequest } from '../middleware/auth.js';

const router = Router();

const REPORT_AUTO_HIDE = 5;

async function isAdminUser(userId: number): Promise<boolean> {
  const r = await query<{ is_admin: boolean }>('SELECT is_admin FROM users WHERE id = $1', [userId]);
  return !!r.rows[0]?.is_admin;
}

// 목록 (offset/limit)
router.get('/', async (req, res) => {
  const type = (req.query.type as string) === 'guide' ? 'guide' : 'free';
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  const r = await query(
    `SELECT id, board_type, character_name, class_name, title, target_class, target_level,
            comment_count, view_count, created_at
     FROM board_posts
     WHERE board_type = $1 AND deleted = FALSE
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [type, limit, offset]
  );
  res.json(r.rows.map(row => ({
    id: row.id,
    boardType: row.board_type,
    characterName: row.character_name,
    className: row.class_name,
    title: row.title,
    targetClass: row.target_class,
    targetLevel: row.target_level,
    commentCount: row.comment_count,
    viewCount: row.view_count,
    createdAt: row.created_at,
  })));
});

// 상세 + 댓글
router.get('/:id', optionalAuth, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

  const pr = await query(
    `SELECT id, board_type, character_id, character_name, class_name, title, body,
            target_class, target_level, comment_count, view_count, created_at
     FROM board_posts WHERE id = $1 AND deleted = FALSE`,
    [id]
  );
  if (pr.rowCount === 0) return res.status(404).json({ error: 'not found' });
  const post = pr.rows[0];

  // view++
  await query('UPDATE board_posts SET view_count = view_count + 1 WHERE id = $1', [id]);

  const cr = await query(
    `SELECT c.id, c.character_id, c.character_name, c.class_name, c.body, c.created_at
     FROM board_comments c
     WHERE c.post_id = $1 AND c.deleted = FALSE
     ORDER BY c.created_at ASC`,
    [id]
  );

  const myUserId = req.userId || null;
  const isAdmin = myUserId ? await isAdminUser(myUserId) : false;

  // 작성자 user_id 조회 (본인 표시용)
  const ownerR = await query<{ user_id: number }>('SELECT user_id FROM characters WHERE id = $1', [post.character_id]);
  const postOwnerUserId = ownerR.rows[0]?.user_id || null;

  // 댓글 본인 표시
  const commentCharIds = [...new Set(cr.rows.map(r => r.character_id))];
  const ownerMap = new Map<number, number>();
  if (commentCharIds.length > 0) {
    const om = await query<{ id: number; user_id: number }>(
      'SELECT id, user_id FROM characters WHERE id = ANY($1::int[])', [commentCharIds]
    );
    for (const row of om.rows) ownerMap.set(row.id, row.user_id);
  }

  res.json({
    id: post.id,
    boardType: post.board_type,
    characterName: post.character_name,
    className: post.class_name,
    title: post.title,
    body: post.body,
    targetClass: post.target_class,
    targetLevel: post.target_level,
    commentCount: post.comment_count,
    viewCount: post.view_count + 1,
    createdAt: post.created_at,
    isOwner: myUserId !== null && postOwnerUserId === myUserId,
    isAdmin,
    comments: cr.rows.map(c => ({
      id: c.id,
      characterName: c.character_name,
      className: c.class_name,
      body: c.body,
      createdAt: c.created_at,
      isOwner: myUserId !== null && ownerMap.get(c.character_id) === myUserId,
    })),
  });
});

// 글 작성
router.post('/', authRequired, async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    boardType: z.enum(['free', 'guide']),
    title: z.string().min(1).max(60),
    body: z.string().min(1).max(2000),
    targetClass: z.string().max(20).optional().nullable(),
    targetLevel: z.number().int().min(1).max(200).optional().nullable(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, boardType, title, body, targetClass, targetLevel } = parsed.data;

  const charR = await query<{ name: string; class_name: string; user_id: number }>(
    'SELECT name, class_name, user_id FROM characters WHERE id = $1', [characterId]
  );
  if (charR.rowCount === 0) return res.status(404).json({ error: 'character not found' });
  if (charR.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'not your character' });

  // 계정 단위 쿨타임 3분
  const recent = await query<{ id: number }>(
    `SELECT p.id FROM board_posts p
     JOIN characters c ON c.id = p.character_id
     WHERE c.user_id = $1 AND p.created_at > NOW() - INTERVAL '3 minutes'
     LIMIT 1`,
    [req.userId]
  );
  if (recent.rowCount && recent.rowCount > 0) return res.status(429).json({ error: '3분에 한 번만 작성할 수 있습니다.' });

  await query(
    `INSERT INTO board_posts (board_type, character_id, character_name, class_name, title, body, target_class, target_level)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [boardType, characterId, charR.rows[0].name, charR.rows[0].class_name, title, body,
     boardType === 'guide' ? (targetClass || null) : null,
     boardType === 'guide' ? (targetLevel || null) : null]
  );
  res.json({ ok: true });
});

// 댓글
router.post('/:id/comments', authRequired, async (req: AuthedRequest, res: Response) => {
  const postId = Number(req.params.id);
  const parsed = z.object({
    characterId: z.number().int().positive(),
    body: z.string().min(1).max(500),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, body } = parsed.data;

  const charR = await query<{ name: string; class_name: string; user_id: number }>(
    'SELECT name, class_name, user_id FROM characters WHERE id = $1', [characterId]
  );
  if (charR.rowCount === 0) return res.status(404).json({ error: 'character not found' });
  if (charR.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'not your character' });

  const pr = await query<{ id: number }>('SELECT id FROM board_posts WHERE id = $1 AND deleted = FALSE', [postId]);
  if (pr.rowCount === 0) return res.status(404).json({ error: 'post not found' });

  // 댓글 쿨타임 30초 (계정)
  const recent = await query<{ id: number }>(
    `SELECT bc.id FROM board_comments bc
     JOIN characters c ON c.id = bc.character_id
     WHERE c.user_id = $1 AND bc.created_at > NOW() - INTERVAL '30 seconds'
     LIMIT 1`,
    [req.userId]
  );
  if (recent.rowCount && recent.rowCount > 0) return res.status(429).json({ error: '30초에 한 번만 댓글 작성 가능합니다.' });

  await query(
    `INSERT INTO board_comments (post_id, character_id, character_name, class_name, body)
     VALUES ($1, $2, $3, $4, $5)`,
    [postId, characterId, charR.rows[0].name, charR.rows[0].class_name, body]
  );
  await query('UPDATE board_posts SET comment_count = comment_count + 1 WHERE id = $1', [postId]);
  res.json({ ok: true });
});

// 글 삭제
router.post('/:id/delete', authRequired, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const pr = await query<{ character_id: number }>('SELECT character_id FROM board_posts WHERE id = $1 AND deleted = FALSE', [id]);
  if (pr.rowCount === 0) return res.status(404).json({ error: 'not found' });

  const charR = await query<{ user_id: number }>('SELECT user_id FROM characters WHERE id = $1', [pr.rows[0].character_id]);
  const isOwner = charR.rows[0]?.user_id === req.userId;
  const admin = await isAdminUser(req.userId!);
  if (!isOwner && !admin) return res.status(403).json({ error: 'no permission' });

  await query('UPDATE board_posts SET deleted = TRUE WHERE id = $1', [id]);
  res.json({ ok: true });
});

// 댓글 삭제
router.post('/comments/:id/delete', authRequired, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const cr = await query<{ character_id: number; post_id: number }>(
    'SELECT character_id, post_id FROM board_comments WHERE id = $1 AND deleted = FALSE', [id]
  );
  if (cr.rowCount === 0) return res.status(404).json({ error: 'not found' });

  const charR = await query<{ user_id: number }>('SELECT user_id FROM characters WHERE id = $1', [cr.rows[0].character_id]);
  const isOwner = charR.rows[0]?.user_id === req.userId;
  const admin = await isAdminUser(req.userId!);
  if (!isOwner && !admin) return res.status(403).json({ error: 'no permission' });

  await query('UPDATE board_comments SET deleted = TRUE WHERE id = $1', [id]);
  await query('UPDATE board_posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = $1', [cr.rows[0].post_id]);
  res.json({ ok: true });
});

// 글 신고
router.post('/:id/report', authRequired, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const reason = (req.body?.reason || '').toString().slice(0, 200);
  const pr = await query<{ id: number }>('SELECT id FROM board_posts WHERE id = $1 AND deleted = FALSE', [id]);
  if (pr.rowCount === 0) return res.status(404).json({ error: 'not found' });

  try {
    await query('INSERT INTO board_reports (post_id, reporter_id, reason) VALUES ($1, $2, $3)', [id, req.userId, reason]);
  } catch {
    return res.status(400).json({ error: '이미 신고했습니다.' });
  }
  const upd = await query<{ report_count: number }>(
    'UPDATE board_posts SET report_count = report_count + 1 WHERE id = $1 RETURNING report_count', [id]
  );
  if (upd.rows[0]?.report_count >= REPORT_AUTO_HIDE) {
    await query('UPDATE board_posts SET deleted = TRUE WHERE id = $1', [id]);
  }
  res.json({ ok: true });
});

// 댓글 신고
router.post('/comments/:id/report', authRequired, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const reason = (req.body?.reason || '').toString().slice(0, 200);
  const cr = await query<{ id: number }>('SELECT id FROM board_comments WHERE id = $1 AND deleted = FALSE', [id]);
  if (cr.rowCount === 0) return res.status(404).json({ error: 'not found' });

  try {
    await query('INSERT INTO board_reports (comment_id, reporter_id, reason) VALUES ($1, $2, $3)', [id, req.userId, reason]);
  } catch {
    return res.status(400).json({ error: '이미 신고했습니다.' });
  }
  res.json({ ok: true });
});

export default router;
