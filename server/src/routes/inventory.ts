import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned, loadCharacter, getEffectiveStats } from '../game/character.js';
import { refreshSessionStats } from '../combat/engine.js';

// 접두사 ID → 이름 매핑 (캐시)
let prefixNameCache: Map<number, string> | null = null;
async function getPrefixNames(): Promise<Map<number, string>> {
  if (prefixNameCache) return prefixNameCache;
  const r = await query<{ id: number; name: string }>('SELECT id, name FROM item_prefixes');
  prefixNameCache = new Map(r.rows.map(row => [row.id, row.name]));
  return prefixNameCache;
}

function buildPrefixName(prefixIds: number[], names: Map<number, string>): string {
  return prefixIds.map(id => names.get(id) || '').filter(Boolean).join(' ');
}

// 전투 세션의 player_stats 갱신 (장비 변경 시)
async function refreshCombatSessionStats(characterId: number) {
  try {
    const sess = await query('SELECT 1 FROM combat_sessions WHERE character_id = $1', [characterId]);
    if (sess.rowCount === 0) return;
    const char = await loadCharacter(characterId);
    if (!char) return;
    const eff = await getEffectiveStats(char);
    await query('UPDATE combat_sessions SET player_stats = $1 WHERE character_id = $2', [JSON.stringify(eff), characterId]);
    // 인메모리 세션도 갱신
    await refreshSessionStats(characterId);
  } catch (e) {
    console.error('[refreshCombatSessionStats]', e);
  }
}

const router = Router();
router.use(authRequired);

// 인벤토리 + 장착 조회
router.get('/:id/inventory', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 삭제된 아이템 참조 정리
  await query(`DELETE FROM character_inventory WHERE character_id = $1 AND item_id NOT IN (SELECT id FROM items)`, [id]);

  const invR = await query<{
    slot_index: number; quantity: number; enhance_level: number;
    prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; locked: boolean;
    item_id: number; name: string; type: string; grade: string; slot: string | null;
    stats: Record<string, number> | null; description: string; stack_size: number; sell_price: number;
  }>(
    `SELECT ci.slot_index, ci.quantity, ci.enhance_level, ci.prefix_ids, ci.prefix_stats, ci.locked,
            i.id AS item_id, i.name, i.type, i.grade, i.slot,
            i.stats, i.description, i.stack_size, i.sell_price, COALESCE(i.required_level, 1) AS required_level
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 ORDER BY ci.slot_index`,
    [id]
  );
  const prefixNames = await getPrefixNames();

  function safePrefixStats(raw: unknown, enhanceLevel = 0): Record<string, number> {
    let stats: Record<string, number> = {};
    if (!raw) return stats;
    if (typeof raw === 'string') { try { stats = JSON.parse(raw); } catch { return {}; } }
    else if (typeof raw === 'object') stats = { ...(raw as Record<string, number>) };
    // 강화 배율 적용 (강화당 +8%)
    if (enhanceLevel > 0) {
      const mult = 1 + enhanceLevel * 0.08;
      for (const k of Object.keys(stats)) {
        stats[k] = Math.round(stats[k] * mult);
      }
    }
    return stats;
  }

  // 강화 배율 적용된 스탯 반환
  function enhancedStats(baseStats: Record<string, number> | null, enhanceLevel: number): Record<string, number> | null {
    if (!baseStats) return null;
    const el = enhanceLevel || 0;
    const mult = el <= 6 ? (1 + el * 0.15) : (1 + 6 * 0.15 + (el - 6) * 0.25);
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(baseStats)) {
      result[k] = Math.round((v as number) * mult);
    }
    return result;
  }

  const inventory = invR.rows.map((r) => {
    const pIds = r.prefix_ids || [];
    const pName = buildPrefixName(pIds, prefixNames);
    return {
      slotIndex: r.slot_index,
      quantity: r.quantity,
      enhanceLevel: r.enhance_level,
      prefixIds: pIds,
      prefixStats: safePrefixStats(r.prefix_stats, r.enhance_level),
      prefixName: pName,
      locked: r.locked,
      item: {
        id: r.item_id, name: pName ? `${pName} ${r.name}` : r.name,
        baseName: r.name,
        type: r.type, grade: r.grade, slot: r.slot,
        stats: enhancedStats(r.stats, r.enhance_level),
        baseStats: r.stats,
        description: r.description, stackSize: r.stack_size, sellPrice: r.sell_price,
        requiredLevel: (r as any).required_level || 1,
      },
    };
  });

  const eqR = await query<{
    slot: string; item_id: number; enhance_level: number;
    prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; locked: boolean;
    name: string; type: string; grade: string;
    item_slot: string | null; stats: Record<string, number> | null; description: string;
  }>(
    `SELECT ce.slot, ce.enhance_level, ce.prefix_ids, ce.prefix_stats, ce.locked,
            i.id AS item_id, i.name, i.type, i.grade, i.slot AS item_slot, i.stats, i.description
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id WHERE ce.character_id = $1`,
    [id]
  );
  // 장착 중 삭제된 아이템 정리
  await query(`DELETE FROM character_equipped WHERE character_id = $1 AND item_id NOT IN (SELECT id FROM items)`, [id]);

  const equipped: Record<string, unknown> = {};
  for (const r of eqR.rows) {
    const pIds = r.prefix_ids || [];
    const pName = buildPrefixName(pIds, prefixNames);
    equipped[r.slot] = {
      id: r.item_id, name: pName ? `${pName} ${r.name}` : r.name,
      baseName: r.name,
      type: r.type, grade: r.grade, slot: r.item_slot,
      stats: enhancedStats(r.stats, r.enhance_level),
      baseStats: r.stats,
      description: r.description, stackSize: 1, sellPrice: 0,
      enhanceLevel: r.enhance_level,
      prefixIds: pIds,
      prefixStats: safePrefixStats(r.prefix_stats, r.enhance_level),
      locked: r.locked,
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
  const invR = await query<{ item_id: number; slot: string | null; enhance_level: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; locked: boolean; required_level: number }>(
    `SELECT ci.item_id, i.slot, ci.enhance_level, ci.prefix_ids, ci.prefix_stats, ci.locked, COALESCE(i.required_level, 1) AS required_level FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND ci.slot_index = $2`,
    [id, parsed.data.slotIndex]
  );
  if (invR.rowCount === 0) return res.status(404).json({ error: 'item not found' });
  if (invR.rows[0].locked) return res.status(400).json({ error: '잠긴 아이템입니다.' });
  const { item_id, slot, enhance_level, prefix_ids, prefix_stats, required_level } = invR.rows[0];
  if (!slot) return res.status(400).json({ error: 'not equippable' });
  if (char.level < required_level) return res.status(400).json({ error: `Lv.${required_level} 이상만 장착 가능` });

  // 해제 먼저 (인벤토리로 돌려보내기)
  const existing = await query<{ item_id: number; enhance_level: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null }>(
    'SELECT item_id, enhance_level, prefix_ids, prefix_stats FROM character_equipped WHERE character_id = $1 AND slot = $2', [id, slot]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    const ex = existing.rows[0];
    const exPrefixIds = ex.prefix_ids && ex.prefix_ids.length > 0 ? ex.prefix_ids : [];
    const exPrefixStats = ex.prefix_stats || {};
    await query('UPDATE character_inventory SET item_id = $1, enhance_level = $2, prefix_ids = $3, prefix_stats = $4::jsonb WHERE character_id = $5 AND slot_index = $6',
      [ex.item_id, ex.enhance_level, exPrefixIds, JSON.stringify(exPrefixStats), id, parsed.data.slotIndex]);
    await query('DELETE FROM character_equipped WHERE character_id = $1 AND slot = $2', [id, slot]);
  } else {
    await query('DELETE FROM character_inventory WHERE character_id = $1 AND slot_index = $2',
      [id, parsed.data.slotIndex]);
  }
  const equipPrefixIds = prefix_ids && prefix_ids.length > 0 ? prefix_ids : [];
  const equipPrefixStats = prefix_stats || {};
  await query('INSERT INTO character_equipped (character_id, slot, item_id, enhance_level, prefix_ids, prefix_stats) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
    [id, slot, item_id, enhance_level, equipPrefixIds, JSON.stringify(equipPrefixStats)]);

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

  const eq = await query<{ item_id: number; enhance_level: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; locked: boolean }>(
    'SELECT item_id, enhance_level, prefix_ids, prefix_stats, locked FROM character_equipped WHERE character_id = $1 AND slot = $2',
    [id, parsed.data.slot]
  );
  if (eq.rowCount === 0) return res.status(404).json({ error: 'nothing equipped' });
  if (eq.rows[0].locked) return res.status(400).json({ error: '잠긴 아이템입니다.' });

  // 빈 인벤토리 슬롯 찾기
  const usedR = await query<{ slot_index: number }>(
    'SELECT slot_index FROM character_inventory WHERE character_id = $1', [id]
  );
  const used = new Set(usedR.rows.map(r => r.slot_index));
  const maxSlots = 300 + (char.inventory_slots_bonus || 0);
  let freeSlot = -1;
  for (let i = 0; i < maxSlots; i++) if (!used.has(i)) { freeSlot = i; break; }
  if (freeSlot < 0) return res.status(400).json({ error: 'inventory full' });

  const eqRow = eq.rows[0];
  const unequipPrefixIds = eqRow.prefix_ids && eqRow.prefix_ids.length > 0 ? eqRow.prefix_ids : [];
  const unequipPrefixStats = eqRow.prefix_stats || {};
  await query('INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, enhance_level, prefix_ids, prefix_stats) VALUES ($1, $2, $3, 1, $4, $5, $6::jsonb)',
    [id, eqRow.item_id, freeSlot, eqRow.enhance_level, unequipPrefixIds, JSON.stringify(unequipPrefixStats)]);
  await query('DELETE FROM character_equipped WHERE character_id = $1 AND slot = $2', [id, parsed.data.slot]);
  await refreshCombatSessionStats(id);
  res.json({ ok: true });
});

// 잠금 토글 (인벤토리)
router.post('/:id/lock', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({ slotIndex: z.number().int() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  await query(
    'UPDATE character_inventory SET locked = NOT locked WHERE character_id = $1 AND slot_index = $2',
    [id, parsed.data.slotIndex]
  );
  res.json({ ok: true });
});

// 잠금 토글 (장착)
router.post('/:id/lock-equipped', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({ slot: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  await query(
    'UPDATE character_equipped SET locked = NOT locked WHERE character_id = $1 AND slot = $2',
    [id, parsed.data.slot]
  );
  res.json({ ok: true });
});

// 아이템 판매
router.post('/:id/sell', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({ slotIndex: z.number().int(), quantity: z.number().int().min(1).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const { slotIndex, quantity: sellQty } = parsed.data;

  const invR = await query<{ id: number; item_id: number; quantity: number; locked: boolean }>(
    'SELECT id, item_id, quantity, locked FROM character_inventory WHERE character_id = $1 AND slot_index = $2',
    [id, slotIndex]
  );
  if (invR.rowCount === 0) return res.status(404).json({ error: 'item not found' });
  const slot = invR.rows[0];
  if (slot.locked) return res.status(400).json({ error: '잠긴 아이템은 판매할 수 없습니다.' });

  const itemR = await query<{ sell_price: number; name: string }>('SELECT sell_price, name FROM items WHERE id = $1', [slot.item_id]);
  if (itemR.rowCount === 0) return res.status(404).json({ error: 'item def not found' });
  const { sell_price, name } = itemR.rows[0];
  if (sell_price <= 0) return res.status(400).json({ error: '판매할 수 없는 아이템입니다.' });

  const qty = Math.min(sellQty || slot.quantity, slot.quantity);
  const gold = sell_price * qty;

  if (qty >= slot.quantity) {
    await query('DELETE FROM character_inventory WHERE id = $1', [slot.id]);
  } else {
    await query('UPDATE character_inventory SET quantity = quantity - $1 WHERE id = $2', [qty, slot.id]);
  }
  await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [gold, id]);

  res.json({ ok: true, sold: name, quantity: qty, gold });
});

// 아이템 분해 (장비만 가능, 물약/소비 제외)
router.post('/:id/dismantle', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({ slotIndex: z.number().int() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const invR = await query<{ id: number; item_id: number; quantity: number; locked: boolean }>(
    'SELECT id, item_id, quantity, locked FROM character_inventory WHERE character_id = $1 AND slot_index = $2',
    [id, parsed.data.slotIndex]
  );
  if (invR.rowCount === 0) return res.status(404).json({ error: 'item not found' });
  const slot = invR.rows[0];
  if (slot.locked) return res.status(400).json({ error: '잠긴 아이템은 분해할 수 없습니다.' });

  const itemR = await query<{ name: string; type: string; slot: string | null; sell_price: number }>(
    'SELECT name, type, slot, sell_price FROM items WHERE id = $1', [slot.item_id]
  );
  if (itemR.rowCount === 0) return res.status(404).json({ error: 'item def not found' });
  const item = itemR.rows[0];

  // 장비만 분해 가능 (소비/재료 제외)
  if (!item.slot) return res.status(400).json({ error: '장비만 분해할 수 있습니다.' });
  if (item.type === 'consumable') return res.status(400).json({ error: '분해 불가 아이템입니다.' });

  const gold = Math.max(1, Math.floor(item.sell_price * 0.5));

  await query('DELETE FROM character_inventory WHERE id = $1', [slot.id]);
  await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [gold, id]);

  res.json({ ok: true, name: item.name, gold });
});

// 자동분해 설정 조회
router.get('/:id/auto-dismantle', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const r = await query<{ auto_dismantle_common: boolean }>(
    'SELECT COALESCE(auto_dismantle_common, FALSE) AS auto_dismantle_common FROM characters WHERE id = $1', [id]
  );
  res.json({ autoDismantleCommon: r.rows[0]?.auto_dismantle_common ?? false });
});

// 자동분해 설정 변경
router.post('/:id/auto-dismantle', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  await query('UPDATE characters SET auto_dismantle_common = $1 WHERE id = $2', [parsed.data.enabled, id]);
  res.json({ autoDismantleCommon: parsed.data.enabled });
});

// 등급별 일괄 판매
router.post('/:id/sell-bulk', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({ grade: z.enum(['common', 'rare', 'epic', 'legendary']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const { grade } = parsed.data;

  // 해당 등급 + 잠금 안 된 아이템 조회
  const items = await query<{ id: number; quantity: number; sell_price: number; name: string }>(
    `SELECT ci.id, ci.quantity, i.sell_price, i.name
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND i.grade = $2 AND ci.locked = FALSE AND i.sell_price > 0 AND i.type != 'consumable'`,
    [id, grade]
  );

  if (items.rowCount === 0) return res.status(400).json({ error: '판매할 아이템이 없습니다.' });

  let totalGold = 0;
  let totalCount = 0;

  for (const item of items.rows) {
    totalGold += item.sell_price * item.quantity;
    totalCount += item.quantity;
    await query('DELETE FROM character_inventory WHERE id = $1', [item.id]);
  }

  await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [totalGold, id]);

  const GRADE_LABEL: Record<string, string> = { common: '일반', rare: '매직', epic: '에픽', legendary: '전설' };
  res.json({ ok: true, grade: GRADE_LABEL[grade], count: totalCount, gold: totalGold });
});

export default router;
