import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

// 강화 로그 (10강 이상, 최근 30개)
router.get('/', async (_req, res) => {
  const r = await query(
    `SELECT character_name, item_name, item_grade, from_level, to_level, success, destroyed, created_at
     FROM enhance_log ORDER BY created_at DESC LIMIT 30`
  );
  res.json(r.rows.map(row => ({
    characterName: row.character_name,
    itemName: row.item_name,
    itemGrade: row.item_grade,
    fromLevel: row.from_level,
    toLevel: row.to_level,
    success: row.success,
    destroyed: row.destroyed,
    createdAt: row.created_at,
  })));
});

export default router;
