import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { addItemToInventory } from '../game/inventory.js';
import { generatePrefixes } from '../game/prefix.js';

const router = Router();
router.use(authRequired);

// 레시피 목록
router.get('/recipes', async (_req, res) => {
  const r = await query<{
    id: number; name: string; material_item_id: number; material_qty: number;
    result_type: string; result_item_ids: number[]; set_id: number | null;
    material_name: string; material_grade: string;
    set_name: string | null; set_description: string | null;
  }>(
    `SELECT cr.id, cr.name, cr.material_item_id, cr.material_qty,
            cr.result_type, cr.result_item_ids, cr.set_id,
            i.name AS material_name, i.grade AS material_grade,
            s.name AS set_name, s.description AS set_description
     FROM craft_recipes cr
     JOIN items i ON i.id = cr.material_item_id
     LEFT JOIN item_sets s ON s.id = cr.set_id
     ORDER BY cr.set_id, cr.id`
  );

  // 결과 아이템 이름 조회
  const allResultIds = [...new Set(r.rows.flatMap(row => row.result_item_ids))];
  const itemsR = allResultIds.length > 0
    ? await query<{ id: number; name: string; grade: string; slot: string | null }>(
        `SELECT id, name, grade, slot FROM items WHERE id = ANY($1)`, [allResultIds]
      )
    : { rows: [] };
  const itemMap = new Map(itemsR.rows.map(i => [i.id, i]));

  res.json(r.rows.map(row => ({
    id: row.id,
    name: row.name,
    materialItemId: row.material_item_id,
    materialName: row.material_name,
    materialGrade: row.material_grade,
    materialQty: row.material_qty,
    resultType: row.result_type,
    resultItems: row.result_item_ids.map(id => itemMap.get(id)).filter(Boolean),
    setId: row.set_id,
    setName: row.set_name,
    setDescription: row.set_description,
  })));
});

// 세트 정보
router.get('/sets', async (_req, res) => {
  const r = await query(
    `SELECT id, name, boss_name, set_bonus_2, set_bonus_4, set_bonus_6, description FROM item_sets ORDER BY id`
  );
  res.json(r.rows.map(row => ({
    id: (row as any).id, name: (row as any).name, bossName: (row as any).boss_name,
    bonus2: (row as any).set_bonus_2, bonus4: (row as any).set_bonus_4, bonus6: (row as any).set_bonus_6,
    description: (row as any).description,
  })));
});

// 제작 실행
router.post('/craft', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    recipeId: z.number().int().positive(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const { characterId, recipeId } = parsed.data;
  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 레시피 조회
  const recipeR = await query<{
    material_item_id: number; material_qty: number; result_item_ids: number[]; result_type: string;
  }>('SELECT material_item_id, material_qty, result_item_ids, result_type FROM craft_recipes WHERE id = $1', [recipeId]);
  if (recipeR.rowCount === 0) return res.status(404).json({ error: 'recipe not found' });
  const recipe = recipeR.rows[0];

  // class_locked 레시피 (110제 무기 등) — 캐릭 직업 무기만 선택지에 남김
  let candidateIds = recipe.result_item_ids;
  if (recipe.result_type === 'class_locked') {
    const cR = await query<{ id: number; class_restriction: string | null }>(
      `SELECT id, class_restriction FROM items WHERE id = ANY($1::int[])`, [recipe.result_item_ids]
    );
    candidateIds = cR.rows.filter(r => !r.class_restriction || r.class_restriction === char.class_name).map(r => r.id);
    if (candidateIds.length === 0) {
      return res.status(400).json({ error: '직업에 해당하는 결과 아이템이 없습니다.' });
    }
  }

  // 재료 보유 확인
  const matR = await query<{ total: string }>(
    `SELECT COALESCE(SUM(quantity), 0)::text AS total FROM character_inventory ci
     WHERE ci.character_id = $1 AND ci.item_id = $2`,
    [characterId, recipe.material_item_id]
  );
  const have = Number(matR.rows[0].total);
  if (have < recipe.material_qty) {
    return res.status(400).json({ error: `재료 부족 (보유: ${have}개, 필요: ${recipe.material_qty}개)` });
  }

  // 재료 차감
  let remaining = recipe.material_qty;
  const slots = await query<{ id: number; quantity: number }>(
    `SELECT id, quantity FROM character_inventory WHERE character_id = $1 AND item_id = $2 ORDER BY slot_index`,
    [characterId, recipe.material_item_id]
  );
  for (const slot of slots.rows) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, slot.quantity);
    if (take >= slot.quantity) {
      await query('DELETE FROM character_inventory WHERE id = $1', [slot.id]);
    } else {
      await query('UPDATE character_inventory SET quantity = quantity - $1 WHERE id = $2', [take, slot.id]);
    }
    remaining -= take;
  }

  // 랜덤 결과 아이템 선택 (class_locked 시 직업 필터된 후보에서)
  const resultItemId = candidateIds[Math.floor(Math.random() * candidateIds.length)];

  // 아이템 종류 확인 (장비 vs 소비) + bound_on_pickup
  const itemInfoR = await query<{ name: string; slot: string | null; type: string; bound_on_pickup: boolean }>(
    'SELECT name, slot, type, COALESCE(bound_on_pickup, FALSE) AS bound_on_pickup FROM items WHERE id = $1', [resultItemId]
  );
  const itemInfo = itemInfoR.rows[0];
  if (!itemInfo) return res.status(500).json({ error: 'item not found' });

  const isEquipment = !!itemInfo.slot;

  // 아이템 레벨 조회 (접두사 스케일링용)
  const rlR = await query<{ required_level: number }>('SELECT COALESCE(required_level, 1) AS required_level FROM items WHERE id = $1', [resultItemId]);
  const craftItemLevel = rlR.rows[0]?.required_level ?? 35;

  if (isEquipment) {
    // 장비: 3옵 접두사 강제 부여
    const { prefixIds, bonusStats } = await generate3Prefixes(craftItemLevel);
    const usedR = await query<{ slot_index: number }>(
      'SELECT slot_index FROM character_inventory WHERE character_id = $1', [characterId]
    );
    const used = new Set(usedR.rows.map(r => r.slot_index));
    let freeSlot = -1;
    for (let i = 0; i < 300; i++) if (!used.has(i)) { freeSlot = i; break; }
    if (freeSlot < 0) return res.status(400).json({ error: '인벤토리 가득!' });

    // 품질 1~100 랜덤 (드랍과 달리 0% 제외 — 제작 보상 가치 보장)
    const quality = Math.floor(Math.random() * 100) + 1;
    // bound_on_pickup → soulbound=TRUE 즉시 귀속 (110제 등 거래 불가)
    await query(
      `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, prefix_ids, prefix_stats, quality, soulbound)
       VALUES ($1, $2, $3, 1, $4, $5::jsonb, $6, $7)`,
      [characterId, resultItemId, freeSlot, prefixIds, JSON.stringify(bonusStats), quality, itemInfo.bound_on_pickup]
    );
    res.json({ ok: true, itemName: itemInfo.name, prefixCount: prefixIds.length, quality, message: `${itemInfo.name} 제작 성공! (3옵 부여 · 품질 ${quality}%)` });
  } else {
    // 소비/재료: 접두사 없이 추가
    const { addItemToInventory: addItem } = await import('../game/inventory.js');
    const { added, overflow } = await addItem(characterId, resultItemId, 1);
    if (overflow > 0) return res.status(400).json({ error: '인벤토리 가득!' });
    res.json({ ok: true, itemName: itemInfo.name, prefixCount: 0, message: `${itemInfo.name} 제작 성공!` });
  }
});

// 3옵 접두사 강제 생성 (아이템 레벨 비례 스케일링)
async function generate3Prefixes(itemLevel: number = 35): Promise<{ prefixIds: number[]; bonusStats: Record<string, number> }> {
  const prefixes = await query<{ id: number; tier: number; stat_key: string; min_val: number; max_val: number }>(
    'SELECT id, tier, stat_key, min_val, max_val FROM item_prefixes ORDER BY id'
  );
  const levelScale = 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;

  const prefixIds: number[] = [];
  const bonusStats: Record<string, number> = {};
  const usedKeys = new Set<string>();

  for (let i = 0; i < 3; i++) {
    const roll = Math.random() * 100;
    const tier = roll < 1 ? 4 : roll < 15 ? 3 : 2;

    const candidates = prefixes.rows.filter(p => p.tier === tier && !usedKeys.has(p.stat_key));
    if (candidates.length === 0) continue;

    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    const baseValue = picked.min_val + Math.floor(Math.random() * (picked.max_val - picked.min_val + 1));
    const value = Math.max(1, Math.round(baseValue * levelScale));

    prefixIds.push(picked.id);
    bonusStats[picked.stat_key] = (bonusStats[picked.stat_key] ?? 0) + value;
    usedKeys.add(picked.stat_key);
  }

  return { prefixIds, bonusStats };
}

export default router;
