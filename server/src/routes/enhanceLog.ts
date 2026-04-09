import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

// 강화 로그 (10강 이상, 최근 30개)
router.get('/', async (_req, res) => {
  const r = await query(
    `SELECT el.character_name, el.item_name, el.item_grade, el.from_level, el.to_level, el.success, el.destroyed, el.created_at
     FROM enhance_log el
     JOIN characters c ON c.id = el.character_id
     JOIN users u ON u.id = c.user_id
     WHERE u.is_admin = FALSE
     ORDER BY el.created_at DESC LIMIT 30`
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
