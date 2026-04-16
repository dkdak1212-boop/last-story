import { Router, type Response } from 'express';
import { z } from 'zod';
import { query, withTransaction, type TxOk, type TxErr } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';

const router = Router();
router.use(authRequired);

const STORAGE_SLOTS = 60;

// 창고 조회 (계정 단위)
router.get('/', async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;
  const itemsR = await query<{
    id: number; slot_index: number; item_id: number; quantity: number;
    enhance_level: number; prefix_ids: number[] | null;
    prefix_stats: Record<string, number> | null; quality: number;
    item_name: string; item_grade: string; item_slot: string | null;
    item_type: string; item_description: string;
    item_stats: Record<string, number> | null; class_restriction: string | null;
    required_level: number;
  }>(
    `SELECT s.id, s.slot_index, s.item_id, s.quantity, s.enhance_level, s.prefix_ids, s.prefix_stats, s.quality,
            i.name AS item_name, i.grade AS item_grade, i.slot AS item_slot, i.type AS item_type,
            i.description AS item_description, i.stats AS item_stats, i.class_restriction,
            COALESCE(i.required_level, 1) AS required_level
     FROM account_storage_items s JOIN items i ON i.id = s.item_id
     WHERE s.user_id = $1 ORDER BY s.slot_index`,
    [userId]
  );
  const goldR = await query<{ storage_gold: string }>(
    'SELECT storage_gold::text FROM users WHERE id = $1', [userId]
  );
  res.json({
    maxSlots: STORAGE_SLOTS,
    gold: Number(goldR.rows[0]?.storage_gold || 0),
    items: itemsR.rows.map(r => ({
      id: r.id,
      slotIndex: r.slot_index,
      itemId: r.item_id,
      quantity: r.quantity,
      enhanceLevel: r.enhance_level,
      prefixIds: r.prefix_ids || [],
      prefixStats: r.prefix_stats || {},
      quality: r.quality,
      item: {
        id: r.item_id, name: r.item_name, grade: r.item_grade,
        slot: r.item_slot, type: r.item_type, description: r.item_description,
        stats: r.item_stats, classRestriction: r.class_restriction,
        requiredLevel: r.required_level,
      },
    })),
  });
});

// 인벤토리 → 창고 (item deposit)
router.post('/deposit', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    inventorySlotIndex: z.number().int().min(0),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, inventorySlotIndex } = parsed.data;
  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const userId = req.userId!;
  const result = await withTransaction<TxOk | TxErr>(async (tx) => {
    const inv = await tx.query<{
      id: number; item_id: number; quantity: number; enhance_level: number;
      prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; quality: number;
    }>(
      'SELECT id, item_id, quantity, enhance_level, prefix_ids, prefix_stats, COALESCE(quality, 0) AS quality FROM character_inventory WHERE character_id = $1 AND slot_index = $2 FOR UPDATE',
      [characterId, inventorySlotIndex]
    );
    if (inv.rowCount === 0) return { error: '아이템 없음', status: 404 };
    const it = inv.rows[0];
    if (it.item_id === 320) return { error: '찢어진 스크롤은 창고에 보관할 수 없습니다.', status: 400 };
    if (it.item_id === 321) return { error: '노드 스크롤 +8은 창고에 보관할 수 없습니다.', status: 400 };

    const usedR = await tx.query<{ slot_index: number }>(
      'SELECT slot_index FROM account_storage_items WHERE user_id = $1', [userId]
    );
    const used = new Set(usedR.rows.map(r => r.slot_index));
    let freeSlot = -1;
    for (let i = 0; i < STORAGE_SLOTS; i++) if (!used.has(i)) { freeSlot = i; break; }
    if (freeSlot < 0) return { error: '창고가 가득 찼습니다', status: 400 };

    await tx.query(
      `INSERT INTO account_storage_items (user_id, slot_index, item_id, quantity, enhance_level, prefix_ids, prefix_stats, quality)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [userId, freeSlot, it.item_id, it.quantity, it.enhance_level,
       it.prefix_ids || [], JSON.stringify(it.prefix_stats || {}), it.quality]
    );
    await tx.query('DELETE FROM character_inventory WHERE id = $1', [it.id]);
    return { ok: true };
  });

  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

// 창고 → 인벤토리 (item withdraw)
router.post('/withdraw', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    storageItemId: z.number().int().positive(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, storageItemId } = parsed.data;
  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const userId = req.userId!;
  const result = await withTransaction<TxOk | TxErr>(async (tx) => {
    const sr = await tx.query<{
      id: number; item_id: number; quantity: number; enhance_level: number;
      prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; quality: number;
    }>(
      'SELECT id, item_id, quantity, enhance_level, prefix_ids, prefix_stats, COALESCE(quality, 0) AS quality FROM account_storage_items WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [storageItemId, userId]
    );
    if (sr.rowCount === 0) return { error: '창고 아이템 없음', status: 404 };
    const it = sr.rows[0];

    const usedR = await tx.query<{ slot_index: number }>(
      'SELECT slot_index FROM character_inventory WHERE character_id = $1', [characterId]
    );
    const used = new Set(usedR.rows.map(r => r.slot_index));
    let freeSlot = -1;
    for (let i = 0; i < 300; i++) if (!used.has(i)) { freeSlot = i; break; }
    if (freeSlot < 0) return { error: '인벤토리가 가득 찼습니다', status: 400 };

    await tx.query(
      `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, enhance_level, prefix_ids, prefix_stats, quality)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [characterId, it.item_id, freeSlot, it.quantity, it.enhance_level,
       it.prefix_ids || [], JSON.stringify(it.prefix_stats || {}), it.quality]
    );
    await tx.query('DELETE FROM account_storage_items WHERE id = $1', [it.id]);
    return { ok: true };
  });

  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

// 골드 입금 (캐릭터 → 창고)
router.post('/gold/deposit', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    amount: z.number().int().positive(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, amount } = parsed.data;
  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const userId = req.userId!;
  const result = await withTransaction<TxOk | TxErr>(async (tx) => {
    const gr = await tx.query<{ gold: number }>(
      'SELECT gold FROM characters WHERE id = $1 FOR UPDATE', [characterId]
    );
    if (gr.rows[0].gold < amount) return { error: '골드 부족', status: 400 };

    await tx.query('UPDATE characters SET gold = gold - $1 WHERE id = $2', [amount, characterId]);
    await tx.query('UPDATE users SET storage_gold = storage_gold + $1 WHERE id = $2', [amount, userId]);
    return { ok: true };
  });

  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

// 골드 출금 (창고 → 캐릭터)
router.post('/gold/withdraw', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    amount: z.number().int().positive(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, amount } = parsed.data;
  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const userId = req.userId!;
  const result = await withTransaction<TxOk | TxErr>(async (tx) => {
    const gr = await tx.query<{ storage_gold: string }>(
      'SELECT storage_gold::text FROM users WHERE id = $1 FOR UPDATE', [userId]
    );
    const have = Number(gr.rows[0]?.storage_gold || 0);
    if (have < amount) return { error: '창고 골드 부족', status: 400 };

    await tx.query('UPDATE users SET storage_gold = storage_gold - $1 WHERE id = $2', [amount, userId]);
    await tx.query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [amount, characterId]);
    return { ok: true };
  });

  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

export default router;
