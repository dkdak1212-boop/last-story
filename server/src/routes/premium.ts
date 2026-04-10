import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';

const router = Router();
router.use(authRequired);

interface PremiumItem {
  code: string;
  name: string;
  description: string;
  priceKrw: number;
  requireCharacter?: boolean;
}

const ITEMS: PremiumItem[] = [];

router.get('/shop', async (_req, res) => {
  res.json(ITEMS);
});

router.post('/purchase', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    code: z.string(),
    characterId: z.number().int().positive().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { code, characterId } = parsed.data;

  const item = ITEMS.find(i => i.code === code);
  if (!item) return res.status(404).json({ error: 'item not found' });

  if (item.requireCharacter && !characterId) return res.status(400).json({ error: 'character required' });
  if (characterId) {
    const char = await loadCharacterOwned(characterId, req.userId!);
    if (!char) return res.status(404).json({ error: 'character not found' });
  }

  // 효과 적용
  switch (code) {
    case 'exp_boost_3d':
      await query(
        `UPDATE characters SET exp_boost_until = GREATEST(COALESCE(exp_boost_until, NOW()), NOW()) + INTERVAL '3 days' WHERE id = $1`,
        [characterId]
      );
      break;
    case 'gold_boost_3d':
      await query(
        `UPDATE characters SET gold_boost_until = GREATEST(COALESCE(gold_boost_until, NOW()), NOW()) + INTERVAL '3 days' WHERE id = $1`,
        [characterId]
      );
      break;
    case 'drop_boost_3d':
      await query(
        `UPDATE characters SET drop_boost_until = GREATEST(COALESCE(drop_boost_until, NOW()), NOW()) + INTERVAL '3 days' WHERE id = $1`,
        [characterId]
      );
      break;
    case 'enhance_scroll_5': {
      const { addItemToInventoryPlain } = await import('../game/inventory.js');
      await addItemToInventoryPlain(characterId!, 286, 5);
      break;
    }
    case 'nick_highlight':
      await query(`UPDATE characters SET nick_highlight = TRUE WHERE id = $1`, [characterId]);
      break;
    default:
      return res.status(400).json({ error: 'unknown item' });
  }

  await query(
    `INSERT INTO premium_purchases (user_id, character_id, item_code) VALUES ($1, $2, $3)`,
    [req.userId, characterId ?? null, code]
  );

  res.json({ ok: true });
});

// 현재 유저/캐릭터 프리미엄 상태
router.get('/status/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const u = await query<{ premium_until: string | null; max_character_slots: number }>(
    `SELECT premium_until, max_character_slots FROM users WHERE id = $1`, [req.userId]
  );
  const c = await query<{ exp_boost_until: string | null; gold_boost_until: string | null; drop_boost_until: string | null }>(
    `SELECT exp_boost_until, COALESCE(gold_boost_until, NULL) AS gold_boost_until, COALESCE(drop_boost_until, NULL) AS drop_boost_until FROM characters WHERE id = $1`, [cid]
  );
  res.json({
    premiumUntil: u.rows[0].premium_until,
    maxCharacterSlots: u.rows[0].max_character_slots,
    expBoostUntil: c.rows[0].exp_boost_until,
    goldBoostUntil: c.rows[0].gold_boost_until,
    dropBoostUntil: c.rows[0].drop_boost_until,
  });
});

export default router;
