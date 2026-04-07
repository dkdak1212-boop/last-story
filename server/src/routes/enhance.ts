import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';

const router = Router();
router.use(authRequired);

// 강화 비용/확률
export function getEnhanceInfo(currentLevel: number, itemLevel: number) {
  const next = currentLevel + 1;
  const lv = Math.max(1, itemLevel);
  let cost: number;
  let chance: number;
  if (next <= 3)      { cost = 50 * lv;   chance = 1.0; }
  else if (next <= 6) { cost = 200 * lv;  chance = 0.8; }
  else if (next <= 9) { cost = 500 * lv;  chance = 0.5; }
  else                { cost = 2000 * lv; chance = 0.2; }
  return { cost, chance, nextLevel: next };
}

// 현재 인벤 / 장착 중 강화 가능한 아이템 목록
router.get('/:characterId/list', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 인벤토리
  const inv = await query<{ slot_index: number; item_id: number; enhance_level: number; name: string; grade: string; slot: string | null; stats: Record<string, number> | null }>(
    `SELECT ci.slot_index, ci.item_id, ci.enhance_level, i.name, i.grade, i.slot, i.stats
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND i.slot IS NOT NULL AND ci.quantity = 1
     ORDER BY ci.slot_index`,
    [cid]
  );
  // 장착
  const eq = await query<{ slot: string; item_id: number; enhance_level: number; name: string; grade: string; item_slot: string; stats: Record<string, number> | null }>(
    `SELECT ce.slot, ce.item_id, ce.enhance_level, i.name, i.grade, i.slot AS item_slot, i.stats
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id
     WHERE ce.character_id = $1`,
    [cid]
  );

  function enhancedStats(baseStats: Record<string, number> | null, enhLevel: number): Record<string, number> | null {
    if (!baseStats) return null;
    const el = enhLevel || 0;
    const mult = el <= 6 ? (1 + el * 0.15) : (1 + 6 * 0.15 + (el - 6) * 0.25);
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(baseStats)) {
      result[k] = Math.round((v as number) * mult);
    }
    return result;
  }

  res.json({
    inventory: inv.rows.map(r => ({
      kind: 'inventory' as const, slotIndex: r.slot_index,
      itemId: r.item_id, name: r.name, grade: r.grade, itemSlot: r.slot,
      stats: enhancedStats(r.stats, r.enhance_level),
      baseStats: r.stats,
      enhanceLevel: r.enhance_level,
    })),
    equipped: eq.rows.map(r => ({
      kind: 'equipped' as const, equipSlot: r.slot,
      itemId: r.item_id, name: r.name, grade: r.grade, itemSlot: r.item_slot,
      stats: enhancedStats(r.stats, r.enhance_level),
      baseStats: r.stats,
      enhanceLevel: r.enhance_level,
    })),
  });
});

// 강화 시도
router.post('/:characterId/attempt', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({
    kind: z.enum(['inventory', 'equipped']),
    slotKey: z.union([z.number().int().min(0), z.string()]),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  // 대상 아이템 조회
  let currentLevel: number;
  if (parsed.data.kind === 'inventory') {
    const r = await query<{ enhance_level: number }>(
      `SELECT ci.enhance_level FROM character_inventory ci
       WHERE ci.character_id = $1 AND ci.slot_index = $2 AND ci.quantity = 1`,
      [cid, parsed.data.slotKey]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'item not found' });
    currentLevel = r.rows[0].enhance_level;
  } else {
    const r = await query<{ enhance_level: number }>(
      `SELECT enhance_level FROM character_equipped WHERE character_id = $1 AND slot = $2`,
      [cid, parsed.data.slotKey]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'item not found' });
    currentLevel = r.rows[0].enhance_level;
  }

  if (currentLevel >= 10) return res.status(400).json({ error: '최대 강화 단계' });

  const info = getEnhanceInfo(currentLevel, char.level);
  if (char.gold < info.cost) return res.status(400).json({ error: 'not enough gold' });

  // 골드 차감
  await query('UPDATE characters SET gold = gold - $1 WHERE id = $2', [info.cost, cid]);

  // 확률 굴림
  const success = Math.random() < info.chance;
  if (success) {
    if (parsed.data.kind === 'inventory') {
      await query(
        `UPDATE character_inventory SET enhance_level = enhance_level + 1
         WHERE character_id = $1 AND slot_index = $2`,
        [cid, parsed.data.slotKey]
      );
    } else {
      await query(
        `UPDATE character_equipped SET enhance_level = enhance_level + 1
         WHERE character_id = $1 AND slot = $2`,
        [cid, parsed.data.slotKey]
      );
    }
  }

  res.json({
    success,
    cost: info.cost,
    chance: info.chance,
    newLevel: success ? currentLevel + 1 : currentLevel,
  });
});

export default router;
