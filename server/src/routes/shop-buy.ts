import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { addItemToInventory } from '../game/inventory.js';

const router = Router();
router.use(authRequired);

// 차원의 통행증 일일 구매 제한
const RIFT_PASS_ITEM_ID = 855;
const RIFT_PASS_DAILY_LIMIT = 2;

router.post('/:id/shop/buy', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({
    itemId: z.number().int().positive(),
    quantity: z.number().int().positive().max(99),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const { itemId, quantity } = parsed.data;
  const shopR = await query<{ buy_price: number }>('SELECT buy_price FROM shop_entries WHERE item_id = $1', [itemId]);
  if (shopR.rowCount === 0) return res.status(404).json({ error: 'not in shop' });

  // 차원의 통행증 — 일일 2회 구매 제한 (KST 자정 초기화).
  if (itemId === RIFT_PASS_ITEM_ID) {
    const stat = await query<{ cnt: number; rdate: string | null; today: string }>(
      `SELECT COALESCE(pass_shop_daily_count, 0) AS cnt,
              pass_shop_daily_date::text AS rdate,
              (NOW() AT TIME ZONE 'Asia/Seoul')::date::text AS today
         FROM characters WHERE id = $1`, [id]
    );
    const row = stat.rows[0];
    const sameDay = row?.rdate === row?.today;
    const cnt = sameDay ? Number(row?.cnt || 0) : 0;
    if (cnt + quantity > RIFT_PASS_DAILY_LIMIT) {
      const left = Math.max(0, RIFT_PASS_DAILY_LIMIT - cnt);
      return res.status(403).json({
        error: left > 0
          ? `차원의 통행증 일일 구매 제한(${RIFT_PASS_DAILY_LIMIT}회). 오늘 ${left}회 더 구매 가능합니다.`
          : '차원의 통행증 일일 구매 제한(2회) 도달. 자정에 초기화됩니다.',
      });
    }
  }

  const totalPrice = shopR.rows[0].buy_price * quantity;
  if (char.gold < totalPrice) return res.status(400).json({ error: 'not enough gold' });

  const { added, overflow } = await addItemToInventory(id, itemId, quantity);
  if (added === 0) return res.status(400).json({ error: 'inventory full' });

  await query('UPDATE characters SET gold = gold - $1 WHERE id = $2', [shopR.rows[0].buy_price * added, id]);

  // 통행증 카운터 +added (실제 인벤 들어간 개수만큼)
  if (itemId === RIFT_PASS_ITEM_ID && added > 0) {
    await query(
      `UPDATE characters
          SET pass_shop_daily_count = CASE
                WHEN pass_shop_daily_date = (NOW() AT TIME ZONE 'Asia/Seoul')::date
                  THEN COALESCE(pass_shop_daily_count, 0) + $1
                ELSE $1 END,
              pass_shop_daily_date = (NOW() AT TIME ZONE 'Asia/Seoul')::date
        WHERE id = $2`,
      [added, id]
    );
  }
  res.json({ ok: true, bought: added, overflow });
});

export default router;
