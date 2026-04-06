import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

// 랭킹 조회 (인증 불필요)
router.get('/', async (req, res) => {
  const type = (req.query.type as string) || 'level';
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  let orderBy: string;
  switch (type) {
    case 'gold':   orderBy = 'gold DESC, level DESC'; break;
    case 'level':
    default:       orderBy = 'level DESC, exp DESC'; break;
  }

  const r = await query<{ id: number; name: string; class_name: string; level: number; gold: string; exp: string }>(
    `SELECT c.id, c.name, c.class_name, c.level, c.gold, c.exp
     FROM characters c JOIN users u ON u.id = c.user_id
     WHERE u.is_admin = FALSE
     ORDER BY ${orderBy} LIMIT $1`,
    [limit]
  );
  res.json(r.rows.map((row, idx) => ({
    rank: idx + 1,
    id: row.id,
    name: row.name,
    className: row.class_name,
    level: row.level,
    gold: Number(row.gold),
    exp: Number(row.exp),
  })));
});

export default router;
