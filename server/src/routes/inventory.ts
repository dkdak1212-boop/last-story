import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned, loadCharacter, getEffectiveStats } from '../game/character.js';
import { refreshSessionStats } from '../combat/engine.js';

// 접두사 ID → {name, tier, stat_key} 매핑 (캐시)
interface PrefixInfo { name: string; tier: number; statKey: string; }
let prefixCache: Map<number, PrefixInfo> | null = null;
async function getPrefixCache(): Promise<Map<number, PrefixInfo>> {
  if (prefixCache) return prefixCache;
  const r = await query<{ id: number; name: string; tier: number; stat_key: string }>(
    'SELECT id, name, tier, stat_key FROM item_prefixes'
  );
  prefixCache = new Map(r.rows.map(row => [row.id, { name: row.name, tier: row.tier, statKey: row.stat_key }]));
  return prefixCache;
}
async function getPrefixNames(): Promise<Map<number, PrefixInfo>> {
  return getPrefixCache();
}

function buildPrefixName(prefixIds: number[], cache: Map<number, PrefixInfo>): string {
  return prefixIds.map(id => cache.get(id)?.name || '').filter(Boolean).join(' ');
}

// stat_key → 최대 tier 매핑 (같은 키가 여러 접두사에 있을 때 최대)
function buildPrefixTiers(prefixIds: number[], cache: Map<number, PrefixInfo>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const id of prefixIds) {
    const info = cache.get(id);
    if (!info) continue;
    if (!result[info.statKey] || result[info.statKey] < info.tier) {
      result[info.statKey] = info.tier;
    }
  }
  return result;
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

  const sort = (req.query.sort as string) || 'recent';
  const orderClause =
    sort === 'grade' ? 'ORDER BY CASE i.grade WHEN \'unique\' THEN 0 WHEN \'legendary\' THEN 1 WHEN \'epic\' THEN 2 WHEN \'rare\' THEN 3 ELSE 4 END, ci.id DESC' :
    sort === 'type' ? 'ORDER BY i.type, i.slot NULLS LAST, i.grade, ci.id DESC' :
    sort === 'level' ? 'ORDER BY COALESCE(i.required_level, 1) DESC, ci.id DESC' :
    sort === 'slot' ? 'ORDER BY ci.slot_index' :
    'ORDER BY ci.id DESC';

  const invR = await query<{
    slot_index: number; quantity: number; enhance_level: number;
    prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; locked: boolean;
    item_id: number; name: string; type: string; grade: string; slot: string | null;
    stats: Record<string, number> | null; description: string; stack_size: number; sell_price: number;
    class_restriction: string | null; quality: number;
  }>(
    `SELECT ci.slot_index, ci.quantity, ci.enhance_level, ci.prefix_ids, ci.prefix_stats, ci.locked,
            i.id AS item_id, i.name, i.type, i.grade, i.slot,
            i.stats, i.description, i.stack_size, i.sell_price, COALESCE(i.required_level, 1) AS required_level,
            i.class_restriction, COALESCE(ci.quality, 0) AS quality
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 ${orderClause}`,
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
      const mult = 1 + enhanceLevel * 0.05;
      for (const k of Object.keys(stats)) {
        stats[k] = Math.round(stats[k] * mult);
      }
    }
    return stats;
  }

  // 강화 배율 + 품질 보너스 (덧셈 합산)
  function enhancedStats(baseStats: Record<string, number> | null, enhanceLevel: number, quality: number = 0): Record<string, number> | null {
    if (!baseStats) return null;
    const el = enhanceLevel || 0;
    const enhMult = 1 + el * 0.075;
    const qualBonus = (quality || 0) / 100;
    const mult = enhMult + qualBonus;
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(baseStats)) {
      result[k] = Math.round((v as number) * mult);
    }
    return result;
  }

  const inventory = invR.rows.map((r) => {
    const pIds = r.prefix_ids || [];
    const pName = buildPrefixName(pIds, prefixNames);
    const pTiers = buildPrefixTiers(pIds, prefixNames);
    return {
      slotIndex: r.slot_index,
      quantity: r.quantity,
      enhanceLevel: r.enhance_level,
      prefixIds: pIds,
      prefixStats: safePrefixStats(r.prefix_stats, r.enhance_level),
      prefixName: pName,
      prefixTiers: pTiers,
      locked: r.locked,
      quality: r.quality || 0,
      item: {
        id: r.item_id, name: pName ? `${pName} ${r.name}` : r.name,
        baseName: r.name,
        type: r.type, grade: r.grade, slot: r.slot,
        stats: enhancedStats(r.stats, r.enhance_level, r.quality),
        baseStats: r.stats,
        description: r.description, stackSize: r.stack_size, sellPrice: r.sell_price,
        requiredLevel: (r as any).required_level || 1,
        classRestriction: r.class_restriction,
      },
    };
  });

  const eqR = await query<{
    slot: string; item_id: number; enhance_level: number;
    prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; locked: boolean;
    name: string; type: string; grade: string;
    item_slot: string | null; stats: Record<string, number> | null; description: string;
    class_restriction: string | null; quality: number;
  }>(
    `SELECT ce.slot, ce.enhance_level, ce.prefix_ids, ce.prefix_stats, ce.locked,
            i.id AS item_id, i.name, i.type, i.grade, i.slot AS item_slot, i.stats, i.description, i.class_restriction,
            COALESCE(ce.quality, 0) AS quality
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id WHERE ce.character_id = $1`,
    [id]
  );
  // 장착 중 삭제된 아이템 정리
  await query(`DELETE FROM character_equipped WHERE character_id = $1 AND item_id NOT IN (SELECT id FROM items)`, [id]);

  const equipped: Record<string, unknown> = {};
  for (const r of eqR.rows) {
    const pIds = r.prefix_ids || [];
    const pName = buildPrefixName(pIds, prefixNames);
    const pTiers = buildPrefixTiers(pIds, prefixNames);
    equipped[r.slot] = {
      id: r.item_id, name: pName ? `${pName} ${r.name}` : r.name,
      baseName: r.name,
      type: r.type, grade: r.grade, slot: r.item_slot,
      stats: enhancedStats(r.stats, r.enhance_level, r.quality),
      baseStats: r.stats,
      description: r.description, stackSize: 1, sellPrice: 0,
      enhanceLevel: r.enhance_level,
      prefixIds: pIds,
      prefixStats: safePrefixStats(r.prefix_stats, r.enhance_level),
      prefixTiers: pTiers,
      locked: r.locked,
      classRestriction: r.class_restriction,
      quality: r.quality || 0,
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
  const invR = await query<{ item_id: number; slot: string | null; enhance_level: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; locked: boolean; required_level: number; class_restriction: string | null; quality: number }>(
    `SELECT ci.item_id, i.slot, ci.enhance_level, ci.prefix_ids, ci.prefix_stats, ci.locked,
            COALESCE(i.required_level, 1) AS required_level, i.class_restriction, COALESCE(ci.quality, 0) AS quality
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND ci.slot_index = $2`,
    [id, parsed.data.slotIndex]
  );
  if (invR.rowCount === 0) return res.status(404).json({ error: 'item not found' });
  // 잠긴 아이템도 장착 허용 — 잠금은 판매/분해/우편/거래소 송부만 차단
  const { item_id, slot, enhance_level, prefix_ids, prefix_stats, required_level, class_restriction, quality } = invR.rows[0];
  if (!slot) return res.status(400).json({ error: 'not equippable' });
  if (char.level < required_level) return res.status(400).json({ error: `Lv.${required_level} 이상만 장착 가능` });
  if (class_restriction && class_restriction !== char.class_name) {
    const classKr: Record<string, string> = { warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적', summoner: '소환사' };
    return res.status(400).json({ error: `${classKr[class_restriction] || class_restriction} 전용 무기입니다.` });
  }

  // 해제 먼저 (인벤토리로 돌려보내기)
  const existing = await query<{ item_id: number; enhance_level: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; locked: boolean; quality: number }>(
    'SELECT item_id, enhance_level, prefix_ids, prefix_stats, locked, COALESCE(quality, 0) AS quality FROM character_equipped WHERE character_id = $1 AND slot = $2', [id, slot]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    const ex = existing.rows[0];
    const exPrefixIds = ex.prefix_ids && ex.prefix_ids.length > 0 ? ex.prefix_ids : [];
    const exPrefixStats = ex.prefix_stats || {};
    // locked 플래그는 장착 상태에서 인벤토리로 이동 시 반드시 보존해야 함 (전체판매 보호)
    await query('UPDATE character_inventory SET item_id = $1, enhance_level = $2, prefix_ids = $3, prefix_stats = $4::jsonb, quality = $5, locked = $6 WHERE character_id = $7 AND slot_index = $8',
      [ex.item_id, ex.enhance_level, exPrefixIds, JSON.stringify(exPrefixStats), ex.quality || 0, ex.locked === true, id, parsed.data.slotIndex]);
    await query('DELETE FROM character_equipped WHERE character_id = $1 AND slot = $2', [id, slot]);
  } else {
    await query('DELETE FROM character_inventory WHERE character_id = $1 AND slot_index = $2',
      [id, parsed.data.slotIndex]);
  }
  const equipPrefixIds = prefix_ids && prefix_ids.length > 0 ? prefix_ids : [];
  const equipPrefixStats = prefix_stats || {};
  const equipLocked = invR.rows[0].locked === true;
  await query('INSERT INTO character_equipped (character_id, slot, item_id, enhance_level, prefix_ids, prefix_stats, quality, locked) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)',
    [id, slot, item_id, enhance_level, equipPrefixIds, JSON.stringify(equipPrefixStats), quality || 0, equipLocked]);

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

  const eq = await query<{ item_id: number; enhance_level: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; locked: boolean; quality: number }>(
    'SELECT item_id, enhance_level, prefix_ids, prefix_stats, locked, COALESCE(quality, 0) AS quality FROM character_equipped WHERE character_id = $1 AND slot = $2',
    [id, parsed.data.slot]
  );
  if (eq.rowCount === 0) return res.status(404).json({ error: 'nothing equipped' });
  // 잠금 아이템도 해제는 가능 — 보존만 정확히 (이전: 해제 차단으로 풀린 채 인벤토리행 위험)

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
  // locked 보존 — 장착 상태에서 잠갔다면 인벤토리로 옮긴 뒤에도 잠금 유지
  await query('INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, enhance_level, prefix_ids, prefix_stats, quality, locked) VALUES ($1, $2, $3, 1, $4, $5, $6::jsonb, $7, $8)',
    [id, eqRow.item_id, freeSlot, eqRow.enhance_level, unequipPrefixIds, JSON.stringify(unequipPrefixStats), eqRow.quality || 0, eqRow.locked === true]);
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

// 자동분해 설정 조회 — T1~T4 비트마스크 기반
// tiers 비트: bit0=T1, bit1=T2, bit2=T3, bit3=T4
router.get('/:id/auto-dismantle', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const r = await query<{ auto_dismantle_tiers: number; auto_dismantle_common: boolean }>(
    'SELECT COALESCE(auto_dismantle_tiers, 0) AS auto_dismantle_tiers, COALESCE(auto_dismantle_common, FALSE) AS auto_dismantle_common FROM characters WHERE id = $1', [id]
  );
  const tiers = r.rows[0]?.auto_dismantle_tiers ?? 0;
  res.json({
    tiers,
    t1: !!(tiers & 1),
    t2: !!(tiers & 2),
    t3: !!(tiers & 4),
    t4: !!(tiers & 8),
    // 하위 호환
    autoDismantleCommon: r.rows[0]?.auto_dismantle_common ?? false,
  });
});

// 자동분해 설정 변경 — T1~T4 개별 토글
router.post('/:id/auto-dismantle', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({
    t1: z.boolean().optional(),
    t2: z.boolean().optional(),
    t3: z.boolean().optional(),
    t4: z.boolean().optional(),
    tiers: z.number().int().min(0).max(15).optional(),
    // 레거시: enabled=true → T1+T2+T3 (이전 동작), false → 0
    enabled: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  let newTiers: number;
  if (typeof parsed.data.tiers === 'number') {
    newTiers = parsed.data.tiers;
  } else if (parsed.data.enabled !== undefined) {
    newTiers = parsed.data.enabled ? 7 : 0;
  } else {
    // 개별 토글로 받은 경우 — 현재 값 로드 후 병합
    const cur = await query<{ auto_dismantle_tiers: number }>(
      'SELECT COALESCE(auto_dismantle_tiers, 0) AS auto_dismantle_tiers FROM characters WHERE id = $1', [id]
    );
    let t = cur.rows[0]?.auto_dismantle_tiers ?? 0;
    if (parsed.data.t1 !== undefined) t = parsed.data.t1 ? (t | 1) : (t & ~1);
    if (parsed.data.t2 !== undefined) t = parsed.data.t2 ? (t | 2) : (t & ~2);
    if (parsed.data.t3 !== undefined) t = parsed.data.t3 ? (t | 4) : (t & ~4);
    if (parsed.data.t4 !== undefined) t = parsed.data.t4 ? (t | 8) : (t & ~8);
    newTiers = t;
  }

  await query(
    'UPDATE characters SET auto_dismantle_tiers = $1, auto_dismantle_common = $2 WHERE id = $3',
    [newTiers, newTiers > 0, id]
  );
  res.json({
    tiers: newTiers,
    t1: !!(newTiers & 1),
    t2: !!(newTiers & 2),
    t3: !!(newTiers & 4),
    t4: !!(newTiers & 8),
    autoDismantleCommon: newTiers > 0,
  });
});

// 등급별 일괄 판매
// 전체 장비 판매 (잠금 제외)
router.post('/:id/sell-bulk', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 잠금 안 된 장비 (소모품/재료 제외)
  const items = await query<{ id: number; quantity: number; sell_price: number; name: string }>(
    `SELECT ci.id, ci.quantity, i.sell_price, i.name
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND ci.locked = FALSE AND i.sell_price > 0
       AND i.type IN ('weapon','armor','accessory')`,
    [id]
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

  res.json({ ok: true, count: totalCount, gold: totalGold });
});

export default router;
