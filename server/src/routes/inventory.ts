import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned, getEffectiveStats } from '../game/character.js';

// 전투 세션의 player_stats 갱신 (장비 변경 시)
async function refreshCombatSessionStats(characterId: number) {
  const sess = await query('SELECT 1 FROM combat_sessions WHERE character_id = $1', [characterId]);
  if (sess.rowCount === 0) return;
  const char = await query<{ id: number; user_id: number; name: string; class_name: string; level: number; exp: number; gold: number; hp: number; mp: number; max_hp: number; max_mp: number; stats: unknown; location: string; last_online_at: string; potion_settings: unknown; inventory_slots_bonus: number; exp_boost_until: string | null }>(
    `SELECT id, user_id, name, class_name, level, exp, gold, hp, mp, max_hp, max_mp, stats, location, last_online_at, potion_settings, inventory_slots_bonus, exp_boost_until FROM characters WHERE id = $1`,
    [characterId]
  );
  if (char.rowCount === 0) return;
  const eff = await getEffectiveStats(char.rows[0] as never);
  await query('UPDATE combat_sessions SET player_stats = $1 WHERE character_id = $2', [eff, characterId]);
}

const router = Router();
router.use(authRequired);

// 인벤토리 + 장착 조회
router.get('/:id/inventory', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const invR = await query<{
    slot_index: number; quantity: number; enhance_level: number;
    item_id: number; name: string; type: string; grade: string; slot: string | null;
    stats: Record<string, number> | null; description: string; stack_size: number; sell_price: number;
  }>(
    `SELECT ci.slot_index, ci.quantity, ci.enhance_level, i.id AS item_id, i.name, i.type, i.grade, i.slot,
            i.stats, i.description, i.stack_size, i.sell_price
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 ORDER BY ci.slot_index`,
    [id]
  );
  const inventory = invR.rows.map((r) => ({
    slotIndex: r.slot_index,
    quantity: r.quantity,
    enhanceLevel: r.enhance_level,
    item: {
      id: r.item_id, name: r.name, type: r.type, grade: r.grade, slot: r.slot,
      stats: r.stats, description: r.description, stackSize: r.stack_size, sellPrice: r.sell_price,
    },
  }));

  const eqR = await query<{
    slot: string; item_id: number; enhance_level: number; name: string; type: string; grade: string;
    item_slot: string | null; stats: Record<string, number> | null; description: string;
  }>(
    `SELECT ce.slot, ce.enhance_level, i.id AS item_id, i.name, i.type, i.grade, i.slot AS item_slot, i.stats, i.description
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id WHERE ce.character_id = $1`,
    [id]
  );
  const equipped: Record<string, unknown> = {};
  for (const r of eqR.rows) {
    equipped[r.slot] = {
      id: r.item_id, name: r.name, type: r.type, grade: r.grade, slot: r.item_slot,
      stats: r.stats, description: r.description, stackSize: 1, sellPrice: 0,
      enhanceLevel: r.enhance_level,
    };
  }

  res.json({ inventory, equipped });
});

// 장착
router.post('/:id/equip', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({ slotIndex: z.number().int() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  // 슬롯에서 아이템 찾기
  const invR = await query<{ item_id: number; slot: string | null; enhance_level: number }>(
    `SELECT ci.item_id, i.slot, ci.enhance_level FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND ci.slot_index = $2`,
    [id, parsed.data.slotIndex]
  );
  if (invR.rowCount === 0) return res.status(404).json({ error: 'item not found' });
  const { item_id, slot, enhance_level } = invR.rows[0];
  if (!slot) return res.status(400).json({ error: 'not equippable' });

  // 해제 먼저 (인벤토리로 돌려보내기)
  const existing = await query<{ item_id: number; enhance_level: number }>(
    'SELECT item_id, enhance_level FROM character_equipped WHERE character_id = $1 AND slot = $2', [id, slot]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    // 현재 장착 아이템을 인벤토리 슬롯으로 이동 (강화 레벨 보존)
    await query('UPDATE character_inventory SET item_id = $1, enhance_level = $2 WHERE character_id = $3 AND slot_index = $4',
      [existing.rows[0].item_id, existing.rows[0].enhance_level, id, parsed.data.slotIndex]);
    await query('DELETE FROM character_equipped WHERE character_id = $1 AND slot = $2', [id, slot]);
  } else {
    // 인벤토리 슬롯 비우기
    await query('DELETE FROM character_inventory WHERE character_id = $1 AND slot_index = $2',
      [id, parsed.data.slotIndex]);
  }
  await query('INSERT INTO character_equipped (character_id, slot, item_id, enhance_level) VALUES ($1, $2, $3, $4)',
    [id, slot, item_id, enhance_level]);

  await refreshCombatSessionStats(id);
  res.json({ ok: true });
});

// 해제
router.post('/:id/unequip', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({ slot: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const eq = await query<{ item_id: number; enhance_level: number }>(
    'SELECT item_id, enhance_level FROM character_equipped WHERE character_id = $1 AND slot = $2',
    [id, parsed.data.slot]
  );
  if (eq.rowCount === 0) return res.status(404).json({ error: 'nothing equipped' });

  // 빈 인벤토리 슬롯 찾기
  const usedR = await query<{ slot_index: number }>(
    'SELECT slot_index FROM character_inventory WHERE character_id = $1', [id]
  );
  const used = new Set(usedR.rows.map(r => r.slot_index));
  const maxSlots = 50 + (char.inventory_slots_bonus || 0);
  let freeSlot = -1;
  for (let i = 0; i < maxSlots; i++) if (!used.has(i)) { freeSlot = i; break; }
  if (freeSlot < 0) return res.status(400).json({ error: 'inventory full' });

  await query('INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, enhance_level) VALUES ($1, $2, $3, 1, $4)',
    [id, eq.rows[0].item_id, freeSlot, eq.rows[0].enhance_level]);
  await query('DELETE FROM character_equipped WHERE character_id = $1 AND slot = $2', [id, parsed.data.slot]);
  await refreshCombatSessionStats(id);
  res.json({ ok: true });
});

export default router;
