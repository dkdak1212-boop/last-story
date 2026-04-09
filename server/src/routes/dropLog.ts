import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

// GET /api/drop-log — 최근 축하 명단 (전설 + 3옵)
router.get('/', async (_req, res) => {
  const r = await query<{
    character_name: string; item_name: string; item_grade: string;
    prefix_count: number; created_at: string;
  }>(
    `SELECT dl.character_name, dl.item_name, dl.item_grade, dl.prefix_count, dl.created_at
     FROM item_drop_log dl
     JOIN characters c ON c.id = dl.character_id
     JOIN users u ON u.id = c.user_id
     WHERE u.is_admin = FALSE
     ORDER BY dl.created_at DESC LIMIT 20`
  );
  res.json(r.rows.map(row => ({
    characterName: row.character_name,
    itemName: row.item_name,
    itemGrade: row.item_grade,
    prefixCount: row.prefix_count,
    createdAt: row.created_at,
  })));
});

export default router;
