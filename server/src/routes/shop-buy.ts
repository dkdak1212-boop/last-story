import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { addItemToInventory } from '../game/inventory.js';

const router = Router();
router.use(authRequired);

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

  const totalPrice = shopR.rows[0].buy_price * quantity;
  if (char.gold < totalPrice) return res.status(400).json({ error: 'not enough gold' });

  const { added, overflow } = await addItemToInventory(id, itemId, quantity);
  if (added === 0) return res.status(400).json({ error: 'inventory full' });

  await query('UPDATE characters SET gold = gold - $1 WHERE id = $2', [shopR.rows[0].buy_price * added, id]);
  res.json({ ok: true, bought: added, overflow });
});

export default router;
