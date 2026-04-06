import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res) => {
  const r = await query(
    `SELECT id, name, required_level AS "requiredLevel", monster_pool AS "monsterPool", description
     FROM fields ORDER BY required_level ASC`
  );
  res.json(r.rows);
});

export default router;
