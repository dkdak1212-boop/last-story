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

const ITEMS: PremiumItem[] = [
  { code: 'inv_slots_10', name: '인벤토리 +10 슬롯', description: '영구히 인벤토리가 10칸 늘어납니다.', priceKrw: 0, requireCharacter: true },
  { code: 'offline_100_7d', name: '오프라인 효율 100% (7일)', description: '7일간 오프라인 보상 효율이 100%가 됩니다.', priceKrw: 0 },
  { code: 'exp_boost_3d', name: '경험치 부스터 +50% (3일)', description: '3일간 획득 경험치가 50% 증가합니다.', priceKrw: 0, requireCharacter: true },
];

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

  // 계정당 1회 구매 제한
  const already = await query(
    'SELECT 1 FROM premium_purchases WHERE user_id = $1 AND item_code = $2',
    [req.userId, code]
  );
  if (already.rowCount && already.rowCount > 0) {
    return res.status(400).json({ error: '이미 구매한 상품입니다.' });
  }

  // 효과 적용
  switch (code) {
    case 'inv_slots_10':
      await query(`UPDATE characters SET inventory_slots_bonus = inventory_slots_bonus + 10 WHERE id = $1`, [characterId]);
      break;
    case 'offline_100_7d':
      await query(
        `UPDATE users SET premium_until = GREATEST(COALESCE(premium_until, NOW()), NOW()) + INTERVAL '7 days' WHERE id = $1`,
        [req.userId]
      );
      break;
    case 'char_slot':
      await query(`UPDATE users SET max_character_slots = max_character_slots + 1 WHERE id = $1`, [req.userId]);
      break;
    case 'exp_boost_3d':
      await query(
        `UPDATE characters SET exp_boost_until = GREATEST(COALESCE(exp_boost_until, NOW()), NOW()) + INTERVAL '3 days' WHERE id = $1`,
        [characterId]
      );
      break;
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
  const c = await query<{ inventory_slots_bonus: number; exp_boost_until: string | null }>(
    `SELECT inventory_slots_bonus, exp_boost_until FROM characters WHERE id = $1`, [cid]
  );
  res.json({
    premiumUntil: u.rows[0].premium_until,
    maxCharacterSlots: u.rows[0].max_character_slots,
    inventorySlotsBonus: c.rows[0].inventory_slots_bonus,
    expBoostUntil: c.rows[0].exp_boost_until,
  });
});

export default router;
