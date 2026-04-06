import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

// GET /api/prefixes — 전체 접두사 목록 (클라이언트 캐시용)
router.get('/', async (_req, res) => {
  const r = await query<{ id: number; name: string; tier: number; stat_key: string; min_val: number; max_val: number }>(
    'SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes ORDER BY stat_key, tier'
  );
  res.json(r.rows.map(row => ({
    id: row.id,
    name: row.name,
    tier: row.tier,
    statKey: row.stat_key,
    minVal: row.min_val,
    maxVal: row.max_val,
  })));
});

export default router;
