import { Router, type Response } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned, loadCharacter, getEffectiveStats } from '../game/character.js';
import { refreshSessionStats, invalidateAutoSellCache } from '../combat/engine.js';
import { addItemToInventory } from '../game/inventory.js';
import { pickRandomUnique } from './guildBoss.js';

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

// 전투 세션 스탯 갱신 (장비 변경 시) — 인메모리 세션만 새로 계산
// (기존 UPDATE combat_sessions SET player_stats 는 컬럼 없어서 실패하던 쿼리 — 제거)
async function refreshCombatSessionStats(characterId: number) {
  try {
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
    class_restriction: string | null; quality: number; soulbound: boolean;
  }>(
    `SELECT ci.slot_index, ci.quantity, ci.enhance_level, ci.prefix_ids, ci.prefix_stats, ci.locked,
            i.id AS item_id, i.name, i.type, i.grade, i.slot,
            i.stats, i.description, i.stack_size, i.sell_price, COALESCE(i.required_level, 1) AS required_level,
            i.class_restriction, COALESCE(ci.quality, 0) AS quality,
            COALESCE(ci.soulbound, FALSE) AS soulbound
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
    // 강화 배율 적용 (강화당 +2.5%)
    if (enhanceLevel > 0) {
      const mult = 1 + enhanceLevel * 0.025;
      for (const k of Object.keys(stats)) {
        stats[k] = Math.round(stats[k] * mult);
      }
    }
    return stats;
  }

  // 강화 배율 (구간식 +5/10/15%) + 품질 보너스 (덧셈 합산)
  function enhancedStats(baseStats: Record<string, number> | null, enhanceLevel: number, quality: number = 0): Record<string, number> | null {
    if (!baseStats) return null;
    const lvl = enhanceLevel || 0;
    const a = Math.min(10, lvl)                    * 0.05;
    const b = Math.max(0, Math.min(10, lvl - 10))  * 0.10;
    const c = Math.max(0, Math.min(10, lvl - 20))  * 0.15;
    const enhMult = 1 + a + b + c;
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
      soulbound: r.soulbound === true,
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

// 장착 — withTransaction + characters FOR UPDATE 로 동시 equip 레이스 직렬화
// (이전: 더블클릭/연타 시 character_equipped(character_id,slot) 23505 unique 위반)
router.post('/:id/equip', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({ slotIndex: z.number().int() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  type Outcome = { ok: true } | { ok: false; status: number; error: string };
  const result = await withTransaction<Outcome>(async (tx) => {
    // 캐릭터 row 락 — 동일 캐릭의 모든 인벤·장착 변경 직렬화
    await tx.query('SELECT id FROM characters WHERE id = $1 FOR UPDATE', [id]);

    const invR = await tx.query<{ item_id: number; slot: string | null; enhance_level: number; enhance_pity: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; locked: boolean; required_level: number; class_restriction: string | null; quality: number }>(
      `SELECT ci.item_id, i.slot, ci.enhance_level, COALESCE(ci.enhance_pity, 0) AS enhance_pity,
              ci.prefix_ids, ci.prefix_stats, ci.locked,
              COALESCE(i.required_level, 1) AS required_level, i.class_restriction, COALESCE(ci.quality, 0) AS quality
       FROM character_inventory ci JOIN items i ON i.id = ci.item_id
       WHERE ci.character_id = $1 AND ci.slot_index = $2`,
      [id, parsed.data.slotIndex]
    );
    if (invR.rowCount === 0) return { ok: false, status: 404, error: 'item not found' };
    const { item_id, slot, enhance_level, enhance_pity, prefix_ids, prefix_stats, required_level, class_restriction, quality } = invR.rows[0];
    if (!slot) return { ok: false, status: 400, error: 'not equippable' };
    if (char.level < required_level) return { ok: false, status: 400, error: `Lv.${required_level} 이상만 장착 가능` };
    if (class_restriction && class_restriction !== char.class_name) {
      const classKr: Record<string, string> = { warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적', summoner: '소환사' };
      return { ok: false, status: 400, error: `${classKr[class_restriction] || class_restriction} 전용 무기입니다.` };
    }

    const existing = await tx.query<{ item_id: number; enhance_level: number; enhance_pity: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; locked: boolean; quality: number; soulbound: boolean }>(
      `SELECT item_id, enhance_level, COALESCE(enhance_pity, 0) AS enhance_pity,
              prefix_ids, prefix_stats, locked,
              COALESCE(quality, 0) AS quality, COALESCE(soulbound, FALSE) AS soulbound
         FROM character_equipped WHERE character_id = $1 AND slot = $2`,
      [id, slot]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      const ex = existing.rows[0];
      const exPrefixIds = ex.prefix_ids && ex.prefix_ids.length > 0 ? ex.prefix_ids : [];
      const exPrefixStats = ex.prefix_stats || {};
      await tx.query(
        `UPDATE character_inventory
            SET item_id = $1, enhance_level = $2, enhance_pity = $3,
                prefix_ids = $4, prefix_stats = $5::jsonb,
                quality = $6, locked = $7, soulbound = $8
          WHERE character_id = $9 AND slot_index = $10`,
        [ex.item_id, ex.enhance_level, Number(ex.enhance_pity || 0),
         exPrefixIds, JSON.stringify(exPrefixStats),
         ex.quality || 0, ex.locked === true, ex.soulbound === true,
         id, parsed.data.slotIndex]
      );
      await tx.query('DELETE FROM character_equipped WHERE character_id = $1 AND slot = $2', [id, slot]);
    } else {
      await tx.query('DELETE FROM character_inventory WHERE character_id = $1 AND slot_index = $2', [id, parsed.data.slotIndex]);
    }
    const equipPrefixIds = prefix_ids && prefix_ids.length > 0 ? prefix_ids : [];
    const equipPrefixStats = prefix_stats || {};
    const equipLocked = invR.rows[0].locked === true;
    // 장착 시 enhance_pity 같이 이동. ON CONFLICT 시 UPDATE 로 덮어씀.
    await tx.query(
      `INSERT INTO character_equipped (character_id, slot, item_id, enhance_level, enhance_pity, prefix_ids, prefix_stats, quality, locked, soulbound)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, TRUE)
       ON CONFLICT (character_id, slot) DO UPDATE SET
         item_id = EXCLUDED.item_id, enhance_level = EXCLUDED.enhance_level,
         enhance_pity = EXCLUDED.enhance_pity,
         prefix_ids = EXCLUDED.prefix_ids, prefix_stats = EXCLUDED.prefix_stats,
         quality = EXCLUDED.quality, locked = EXCLUDED.locked, soulbound = EXCLUDED.soulbound`,
      [id, slot, item_id, enhance_level, Number(enhance_pity || 0),
       equipPrefixIds, JSON.stringify(equipPrefixStats), quality || 0, equipLocked]
    );
    return { ok: true };
  });

  if (!result.ok) return res.status(result.status).json({ error: result.error });
  await refreshCombatSessionStats(id);
  res.json({ ok: true });
});

// 해제 — equip 과 동일하게 트랜잭션 + FOR UPDATE
router.post('/:id/unequip', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 오프라인 모드 캐릭은 장비 해제 차단 — 본캐 오프라인 누적 중에 장비를
  // 부캐로 옮겨 빠른 속도내는 어뷰즈 방지.
  const offR = await query<{ last_offline_at: string | null }>(
    `SELECT last_offline_at FROM characters WHERE id = $1`, [id]
  );
  if (offR.rows[0]?.last_offline_at) {
    return res.status(400).json({ error: '오프라인 모드 중에는 장비를 해제할 수 없습니다.' });
  }

  const parsed = z.object({ slot: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  type Outcome = { ok: true } | { ok: false; status: number; error: string };
  const result = await withTransaction<Outcome>(async (tx) => {
    await tx.query('SELECT id FROM characters WHERE id = $1 FOR UPDATE', [id]);

    const eq = await tx.query<{ item_id: number; enhance_level: number; enhance_pity: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; locked: boolean; quality: number; soulbound: boolean }>(
      `SELECT item_id, enhance_level, COALESCE(enhance_pity, 0) AS enhance_pity,
              prefix_ids, prefix_stats, locked,
              COALESCE(quality, 0) AS quality, COALESCE(soulbound, FALSE) AS soulbound
         FROM character_equipped WHERE character_id = $1 AND slot = $2`,
      [id, parsed.data.slot]
    );
    if (eq.rowCount === 0) return { ok: false, status: 404, error: 'nothing equipped' };

    const usedR = await tx.query<{ slot_index: number }>(
      'SELECT slot_index FROM character_inventory WHERE character_id = $1', [id]
    );
    const used = new Set(usedR.rows.map(r => r.slot_index));
    const maxSlots = 300 + (char.inventory_slots_bonus || 0);
    let freeSlot = -1;
    for (let i = 0; i < maxSlots; i++) if (!used.has(i)) { freeSlot = i; break; }
    if (freeSlot < 0) return { ok: false, status: 400, error: 'inventory full' };

    const eqRow = eq.rows[0];
    const unequipPrefixIds = eqRow.prefix_ids && eqRow.prefix_ids.length > 0 ? eqRow.prefix_ids : [];
    const unequipPrefixStats = eqRow.prefix_stats || {};
    // ON CONFLICT — 동시 인벤 INSERT 레이스 (드랍/상점 등) 방어
    const ins = await tx.query(
      `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, enhance_level, enhance_pity, prefix_ids, prefix_stats, quality, locked, soulbound)
       VALUES ($1, $2, $3, 1, $4, $5, $6, $7::jsonb, $8, $9, $10)
       ON CONFLICT (character_id, slot_index) DO NOTHING`,
      [id, eqRow.item_id, freeSlot, eqRow.enhance_level, Number(eqRow.enhance_pity || 0),
       unequipPrefixIds, JSON.stringify(unequipPrefixStats), eqRow.quality || 0, eqRow.locked === true, eqRow.soulbound === true]
    );
    if (!ins.rowCount) return { ok: false, status: 409, error: '슬롯 충돌 — 다시 시도해주세요.' };
    await tx.query('DELETE FROM character_equipped WHERE character_id = $1 AND slot = $2', [id, parsed.data.slot]);
    return { ok: true };
  });

  if (!result.ok) return res.status(result.status).json({ error: result.error });
  await refreshCombatSessionStats(id);
  res.json({ ok: true });
});

// 유니크 무작위 추첨권 사용 — 캐릭 레벨 ±10 범위의 유니크 1개 지급
router.post('/:id/use-unique-ticket', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 추첨권 1개 소모
  const ticketR = await query<{ id: number; quantity: number }>(
    `SELECT ci.id, ci.quantity FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND i.name = '유니크 무작위 추첨권' AND ci.quantity > 0
     ORDER BY ci.slot_index LIMIT 1`, [id]
  );
  if (ticketR.rowCount === 0) return res.status(400).json({ error: '유니크 무작위 추첨권이 없습니다.' });
  const ticket = ticketR.rows[0];

  const uniqueItemId = await pickRandomUnique(char.level);
  if (!uniqueItemId) return res.status(500).json({ error: '해당 레벨 범위의 유니크 아이템이 없습니다.' });

  // 인벤에 유니크 먼저 지급 (실패 시 추첨권 소모 X)
  const { added, overflow } = await addItemToInventory(id, uniqueItemId, 1);
  if (added <= 0 || overflow > 0) {
    return res.status(400).json({ error: '인벤토리가 가득 찼습니다. 공간을 확보한 후 사용해주세요.' });
  }

  // 추첨권 소모
  if (ticket.quantity <= 1) {
    await query('DELETE FROM character_inventory WHERE id = $1', [ticket.id]);
  } else {
    await query('UPDATE character_inventory SET quantity = quantity - 1 WHERE id = $1', [ticket.id]);
  }

  const nameR = await query<{ name: string }>('SELECT name FROM items WHERE id = $1', [uniqueItemId]);
  res.json({ ok: true, uniqueItemId, uniqueItemName: nameR.rows[0]?.name || '알 수 없는 유니크' });
});

// 유니크 조각 합성 — 3개 소모 → 캐릭 레벨 ±10 범위 유니크 1개 지급
router.post('/:id/craft-unique-piece', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 조각 3개 보유 체크 (합계 수량)
  const pieceR = await query<{ total: string }>(
    `SELECT COALESCE(SUM(ci.quantity), 0)::text AS total FROM character_inventory ci
     JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND i.name = '유니크 조각'`, [id]
  );
  const totalPieces = Number(pieceR.rows[0].total);
  if (totalPieces < 3) return res.status(400).json({ error: `유니크 조각 부족 (${totalPieces}/3)` });

  // 유니크 아이템 먼저 지급 시도
  const uniqueItemId = await pickRandomUnique(char.level);
  if (!uniqueItemId) return res.status(500).json({ error: '해당 레벨 범위의 유니크 아이템이 없습니다.' });

  const { added, overflow } = await addItemToInventory(id, uniqueItemId, 1);
  if (added <= 0 || overflow > 0) {
    return res.status(400).json({ error: '인벤토리가 가득 찼습니다. 공간을 확보한 후 사용해주세요.' });
  }

  // 조각 3개 소모 (가장 오래된 슬롯부터)
  let need = 3;
  const stackR = await query<{ id: number; quantity: number }>(
    `SELECT ci.id, ci.quantity FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND i.name = '유니크 조각' AND ci.quantity > 0
     ORDER BY ci.slot_index`, [id]
  );
  for (const stack of stackR.rows) {
    if (need <= 0) break;
    const take = Math.min(need, stack.quantity);
    if (stack.quantity - take <= 0) {
      await query('DELETE FROM character_inventory WHERE id = $1', [stack.id]);
    } else {
      await query('UPDATE character_inventory SET quantity = quantity - $1 WHERE id = $2', [take, stack.id]);
    }
    need -= take;
  }

  const nameR = await query<{ name: string }>('SELECT name FROM items WHERE id = $1', [uniqueItemId]);
  res.json({ ok: true, uniqueItemId, uniqueItemName: nameR.rows[0]?.name || '알 수 없는 유니크' });
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
  // 아이템 판매 시 골드 지급 중단 (다계정 자금세탁 차단) — 아이템만 소멸
  const gold = 0;

  if (qty >= slot.quantity) {
    await query('DELETE FROM character_inventory WHERE id = $1', [slot.id]);
  } else {
    await query('UPDATE character_inventory SET quantity = quantity - $1 WHERE id = $2', [qty, slot.id]);
  }

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

  // 분해 시 골드 지급 중단 — 아이템만 소멸
  const gold = 0;

  await query('DELETE FROM character_inventory WHERE id = $1', [slot.id]);

  res.json({ ok: true, name: item.name, gold });
});

// 자동판매 설정 조회
router.get('/:id/auto-dismantle', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const r = await query<{ auto_dismantle_tiers: number; auto_sell_quality_max: number; auto_sell_protect_prefixes: string[]; auto_sell_protect_3opt: boolean }>(
    `SELECT COALESCE(auto_dismantle_tiers, 0) AS auto_dismantle_tiers,
            COALESCE(auto_sell_quality_max, 0) AS auto_sell_quality_max,
            COALESCE(auto_sell_protect_prefixes, '{}') AS auto_sell_protect_prefixes,
            COALESCE(auto_sell_protect_3opt, TRUE) AS auto_sell_protect_3opt
     FROM characters WHERE id = $1`, [id]
  );
  const tiers = r.rows[0]?.auto_dismantle_tiers ?? 0;
  res.json({
    tiers,
    t1: !!(tiers & 1), t2: !!(tiers & 2), t3: !!(tiers & 4), t4: !!(tiers & 8),
    qualityMax: r.rows[0]?.auto_sell_quality_max ?? 0,
    protectPrefixes: r.rows[0]?.auto_sell_protect_prefixes ?? [],
    protect3opt: r.rows[0]?.auto_sell_protect_3opt ?? true,
  });
});

// 자동판매 설정 변경
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
    qualityMax: z.number().int().min(0).max(100).optional(),
    protectPrefixes: z.array(z.string()).optional(),
    protect3opt: z.boolean().optional(),
    enabled: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  let newTiers: number;
  if (typeof parsed.data.tiers === 'number') {
    newTiers = parsed.data.tiers;
  } else if (parsed.data.enabled !== undefined) {
    newTiers = parsed.data.enabled ? 7 : 0;
  } else {
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

  const updates: string[] = ['auto_dismantle_tiers = $1', 'auto_dismantle_common = $2'];
  const params: unknown[] = [newTiers, newTiers > 0];
  if (parsed.data.qualityMax !== undefined) {
    updates.push(`auto_sell_quality_max = $${params.length + 1}`);
    params.push(parsed.data.qualityMax);
  }
  if (parsed.data.protectPrefixes !== undefined) {
    updates.push(`auto_sell_protect_prefixes = $${params.length + 1}`);
    params.push(parsed.data.protectPrefixes);
  }
  if (parsed.data.protect3opt !== undefined) {
    updates.push(`auto_sell_protect_3opt = $${params.length + 1}`);
    params.push(parsed.data.protect3opt);
  }
  params.push(id);
  await query(`UPDATE characters SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
  invalidateAutoSellCache(id); // 전투 세션이 있으면 다음 킬에 재로드

  const fresh = await query<{ auto_sell_quality_max: number; auto_sell_protect_prefixes: string[] }>(
    `SELECT COALESCE(auto_sell_quality_max, 0) AS auto_sell_quality_max,
            COALESCE(auto_sell_protect_prefixes, '{}') AS auto_sell_protect_prefixes
     FROM characters WHERE id = $1`, [id]
  );

  res.json({
    tiers: newTiers,
    t1: !!(newTiers & 1), t2: !!(newTiers & 2), t3: !!(newTiers & 4), t4: !!(newTiers & 8),
    qualityMax: fresh.rows[0]?.auto_sell_quality_max ?? 0,
    protectPrefixes: fresh.rows[0]?.auto_sell_protect_prefixes ?? [],
  });
});

// 드랍 필터 조회 (T1~T4 + 품질 + 일반등급)
router.get('/:id/drop-filter', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const r = await query<{ drop_filter_tiers: number; drop_filter_common: boolean; drop_filter_protect_prefixes: string[]; drop_filter_protect_3opt: boolean }>(
    `SELECT COALESCE(drop_filter_tiers, 0) AS drop_filter_tiers,
            COALESCE(drop_filter_common, FALSE) AS drop_filter_common,
            COALESCE(drop_filter_protect_prefixes, '{}') AS drop_filter_protect_prefixes,
            COALESCE(drop_filter_protect_3opt, TRUE) AS drop_filter_protect_3opt
     FROM characters WHERE id = $1`, [id]
  );
  const t = r.rows[0]?.drop_filter_tiers ?? 0;
  res.json({
    t1: !!(t & 1), t2: !!(t & 2), t3: !!(t & 4), t4: !!(t & 8),
    common: r.rows[0]?.drop_filter_common ?? false,
    protectPrefixes: r.rows[0]?.drop_filter_protect_prefixes ?? [],
    protect3opt: r.rows[0]?.drop_filter_protect_3opt ?? true,
  });
});

// 드랍 필터 설정
router.post('/:id/drop-filter', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const parsed = z.object({
    t1: z.boolean().optional(),
    t2: z.boolean().optional(),
    t3: z.boolean().optional(),
    t4: z.boolean().optional(),
    common: z.boolean().optional(),
    protectPrefixes: z.array(z.string()).optional(),
    protect3opt: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const cur = await query<{ drop_filter_tiers: number; drop_filter_common: boolean }>(
    `SELECT COALESCE(drop_filter_tiers, 0) AS drop_filter_tiers,
            COALESCE(drop_filter_common, FALSE) AS drop_filter_common
     FROM characters WHERE id = $1`, [id]
  );
  let t = cur.rows[0]?.drop_filter_tiers ?? 0;
  if (parsed.data.t1 !== undefined) t = parsed.data.t1 ? (t | 1) : (t & ~1);
  if (parsed.data.t2 !== undefined) t = parsed.data.t2 ? (t | 2) : (t & ~2);
  if (parsed.data.t3 !== undefined) t = parsed.data.t3 ? (t | 4) : (t & ~4);
  if (parsed.data.t4 !== undefined) t = parsed.data.t4 ? (t | 8) : (t & ~8);
  const cm = parsed.data.common ?? cur.rows[0]?.drop_filter_common ?? false;
  const updates = ['drop_filter_tiers = $1', 'drop_filter_common = $2'];
  const params: unknown[] = [t, cm];
  if (parsed.data.protectPrefixes !== undefined) {
    updates.push(`drop_filter_protect_prefixes = $${params.length + 1}`);
    params.push(parsed.data.protectPrefixes);
  }
  if (parsed.data.protect3opt !== undefined) {
    updates.push(`drop_filter_protect_3opt = $${params.length + 1}`);
    params.push(parsed.data.protect3opt);
  }
  params.push(id);
  await query(`UPDATE characters SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
  invalidateAutoSellCache(id);
  const fresh = await query<{ drop_filter_protect_prefixes: string[]; drop_filter_protect_3opt: boolean }>(
    `SELECT COALESCE(drop_filter_protect_prefixes, '{}') AS drop_filter_protect_prefixes,
            COALESCE(drop_filter_protect_3opt, TRUE) AS drop_filter_protect_3opt
     FROM characters WHERE id = $1`, [id]
  );
  res.json({
    t1: !!(t & 1), t2: !!(t & 2), t3: !!(t & 4), t4: !!(t & 8),
    common: cm,
    protectPrefixes: fresh.rows[0]?.drop_filter_protect_prefixes ?? [],
    protect3opt: fresh.rows[0]?.drop_filter_protect_3opt ?? true,
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

  // 전체판매 시 골드 지급 중단 — 아이템만 일괄 소멸
  let totalCount = 0;
  for (const item of items.rows) {
    totalCount += item.quantity;
    await query('DELETE FROM character_inventory WHERE id = $1', [item.id]);
  }

  res.json({ ok: true, count: totalCount, gold: 0 });
});

// ═══ 장비 프리셋 ═══

// 목록 조회
router.get('/:id/equip-presets', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const r = await query<{ preset_idx: number; name: string; slots: any }>(
    'SELECT preset_idx, name, slots FROM character_equip_presets WHERE character_id = $1 ORDER BY preset_idx', [id]
  );
  const map = new Map(r.rows.map(row => [row.preset_idx, row]));
  const presets = [1, 2, 3].map(idx => {
    const p = map.get(idx);
    return { idx, name: p?.name || `프리셋 ${idx}`, slots: p?.slots || {}, empty: !p };
  });
  res.json(presets);
});

// 현재 장착 → 프리셋 저장
router.post('/:id/equip-presets/:idx/save', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const idx = Number(req.params.idx);
  if (idx < 1 || idx > 3) return res.status(400).json({ error: 'invalid preset index' });
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const eqR = await query<{ slot: string; item_id: number; enhance_level: number; prefix_ids: number[]; prefix_stats: any; quality: number; locked: boolean; soulbound: boolean }>(
    'SELECT slot, item_id, enhance_level, prefix_ids, prefix_stats, COALESCE(quality, 0) AS quality, locked, COALESCE(soulbound, FALSE) AS soulbound FROM character_equipped WHERE character_id = $1', [id]
  );
  const slots: Record<string, any> = {};
  for (const row of eqR.rows) {
    slots[row.slot] = { itemId: row.item_id, enhanceLevel: row.enhance_level, prefixIds: row.prefix_ids || [], prefixStats: row.prefix_stats || {}, quality: row.quality, locked: row.locked, soulbound: row.soulbound === true };
  }

  await query(
    `INSERT INTO character_equip_presets (character_id, preset_idx, slots)
     VALUES ($1, $2, $3)
     ON CONFLICT (character_id, preset_idx) DO UPDATE SET slots = $3`,
    [id, idx, JSON.stringify(slots)]
  );
  res.json({ ok: true });
});

// 프리셋 → 장착 로드
router.post('/:id/equip-presets/:idx/load', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const idx = Number(req.params.idx);
  if (idx < 1 || idx > 3) return res.status(400).json({ error: 'invalid preset index' });
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const pr = await query<{ slots: any }>(
    'SELECT slots FROM character_equip_presets WHERE character_id = $1 AND preset_idx = $2', [id, idx]
  );
  if (pr.rowCount === 0) return res.status(404).json({ error: '저장된 프리셋이 없습니다' });
  const savedSlots = pr.rows[0].slots as Record<string, { itemId: number; enhanceLevel: number; prefixIds: number[]; prefixStats: any; quality: number; locked: boolean; soulbound?: boolean }>;

  // 현재 장착 해제 → 인벤토리로 (soulbound 보존)
  const curEq = await query<{ slot: string; item_id: number; enhance_level: number; prefix_ids: number[]; prefix_stats: any; quality: number; locked: boolean; soulbound: boolean }>(
    'SELECT slot, item_id, enhance_level, prefix_ids, prefix_stats, COALESCE(quality, 0) AS quality, locked, COALESCE(soulbound, FALSE) AS soulbound FROM character_equipped WHERE character_id = $1', [id]
  );
  for (const eq of curEq.rows) {
    const usedR = await query<{ slot_index: number }>('SELECT slot_index FROM character_inventory WHERE character_id = $1', [id]);
    const used = new Set(usedR.rows.map(r => r.slot_index));
    let freeSlot = -1;
    for (let i = 0; i < 300; i++) if (!used.has(i)) { freeSlot = i; break; }
    if (freeSlot < 0) return res.status(400).json({ error: '인벤토리가 가득 찼습니다' });
    await query(
      'INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, enhance_level, prefix_ids, prefix_stats, quality, locked, soulbound) VALUES ($1,$2,$3,1,$4,$5,$6::jsonb,$7,$8,$9)',
      [id, eq.item_id, freeSlot, eq.enhance_level, eq.prefix_ids || [], JSON.stringify(eq.prefix_stats || {}), eq.quality, eq.locked === true, eq.soulbound === true]
    );
  }
  await query('DELETE FROM character_equipped WHERE character_id = $1', [id]);

  // 프리셋 아이템 장착 (인벤토리에서 매칭)
  let equipped = 0;
  for (const [slot, saved] of Object.entries(savedSlots)) {
    // 인벤토리에서 동일 아이템 찾기 (item_id + enhance_level + quality 매칭)
    const match = await query<{ id: number; slot_index: number; prefix_ids: number[]; prefix_stats: any; quality: number; locked: boolean; soulbound: boolean }>(
      `SELECT ci.id, ci.slot_index, ci.prefix_ids, ci.prefix_stats, COALESCE(ci.quality, 0) AS quality, ci.locked, COALESCE(ci.soulbound, FALSE) AS soulbound
       FROM character_inventory ci
       WHERE ci.character_id = $1 AND ci.item_id = $2 AND ci.enhance_level = $3 AND COALESCE(ci.quality, 0) = $4
       LIMIT 1`,
      [id, saved.itemId, saved.enhanceLevel, saved.quality]
    );
    if (match.rowCount === 0) continue;
    const m = match.rows[0];
    // 장착 시 항상 soulbound=TRUE (일반 equip 경로와 동일). 인벤에서 넘어온 soulbound 도 OR
    const newSoulbound = m.soulbound === true || saved.soulbound === true || true;
    await query(
      'INSERT INTO character_equipped (character_id, slot, item_id, enhance_level, prefix_ids, prefix_stats, quality, locked, soulbound) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)',
      [id, slot, saved.itemId, saved.enhanceLevel, m.prefix_ids || [], JSON.stringify(m.prefix_stats || {}), m.quality, m.locked === true, newSoulbound]
    );
    await query('DELETE FROM character_inventory WHERE id = $1', [m.id]);
    equipped++;
  }

  await refreshCombatSessionStats(id);
  res.json({ ok: true, equipped });
});

// 프리셋 이름 변경
router.post('/:id/equip-presets/:idx/rename', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const idx = Number(req.params.idx);
  const parsed = z.object({ name: z.string().max(20) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  await query(
    `INSERT INTO character_equip_presets (character_id, preset_idx, name, slots)
     VALUES ($1, $2, $3, '{}')
     ON CONFLICT (character_id, preset_idx) DO UPDATE SET name = $3`,
    [id, idx, parsed.data.name]
  );
  res.json({ ok: true });
});

export default router;
