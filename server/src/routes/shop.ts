import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

// NPC 상점 판매 목록 (고정 아이템)
router.get('/', async (_req, res) => {
  const r = await query(
    `SELECT i.id, i.name, i.type, i.grade, i.slot, i.stats, i.description,
            i.stack_size AS "stackSize", i.sell_price AS "sellPrice",
            s.buy_price AS price
     FROM shop_entries s JOIN items i ON i.id = s.item_id
     ORDER BY s.buy_price ASC`
  );
  res.json(r.rows.map((row) => ({
    item: {
      id: row.id,
      name: row.name,
      type: row.type,
      grade: row.grade,
      slot: row.slot,
      stats: row.stats,
      description: row.description,
      stackSize: row.stackSize,
      sellPrice: row.sellPrice,
    },
    price: row.price,
  })));
});

export default router;
