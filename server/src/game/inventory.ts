import { query } from '../db/pool.js';
import { generatePrefixes } from './prefix.js';

export const BASE_INVENTORY_SLOTS = 100;

async function getMaxSlots(characterId: number): Promise<number> {
  const r = await query<{ bonus: number }>(
    `SELECT inventory_slots_bonus AS bonus FROM characters WHERE id = $1`, [characterId]
  );
  return BASE_INVENTORY_SLOTS + (r.rows[0]?.bonus || 0);
}

export async function addItemToInventory(
  characterId: number,
  itemId: number,
  quantity: number
): Promise<{ added: number; overflow: number }> {
  // 아이템 조회 — 스택 가능 여부 + 장비 여부
  const itemR = await query<{ stack_size: number; slot: string | null }>(
    'SELECT stack_size, slot FROM items WHERE id = $1',
    [itemId]
  );
  if (itemR.rowCount === 0) return { added: 0, overflow: quantity };
  const stackSize = itemR.rows[0].stack_size;
  const isEquipment = !!itemR.rows[0].slot; // 장비 아이템이면 접두사 부여

  let remaining = quantity;

  // 기존 스택에 합치기
  if (stackSize > 1) {
    const existing = await query<{ id: number; quantity: number }>(
      `SELECT id, quantity FROM character_inventory
       WHERE character_id = $1 AND item_id = $2 AND quantity < $3
       ORDER BY slot_index ASC`,
      [characterId, itemId, stackSize]
    );
    for (const row of existing.rows) {
      const canAdd = Math.min(remaining, stackSize - row.quantity);
      if (canAdd <= 0) break;
      await query('UPDATE character_inventory SET quantity = quantity + $1 WHERE id = $2', [canAdd, row.id]);
      remaining -= canAdd;
      if (remaining === 0) return { added: quantity, overflow: 0 };
    }
  }

  // 새 슬롯 찾기
  const usedR = await query<{ slot_index: number }>(
    'SELECT slot_index FROM character_inventory WHERE character_id = $1',
    [characterId]
  );
  const used = new Set(usedR.rows.map((r) => r.slot_index));
  const maxSlots = await getMaxSlots(characterId);
  const freeSlots: number[] = [];
  for (let i = 0; i < maxSlots; i++) {
    if (!used.has(i)) freeSlots.push(i);
  }

  while (remaining > 0 && freeSlots.length > 0) {
    const slot = freeSlots.shift()!;
    const qty = Math.min(remaining, stackSize);

    if (isEquipment) {
      // 장비 아이템: 접두사 랜덤 생성
      const { prefixIds, bonusStats } = await generatePrefixes();
      await query(
        `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, prefix_ids, prefix_stats)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [characterId, itemId, slot, qty, prefixIds.length > 0 ? prefixIds : [], JSON.stringify(bonusStats)]
      );
      // 전설 등급 또는 3옵 → 드롭 로그 기록
      const itemInfo = await query<{ name: string; grade: string }>('SELECT name, grade FROM items WHERE id = $1', [itemId]);
      if (itemInfo.rows[0]) {
        const { name: iName, grade } = itemInfo.rows[0];
        if (grade === 'legendary' || prefixIds.length >= 3) {
          const charInfo = await query<{ name: string }>('SELECT name FROM characters WHERE id = $1', [characterId]);
          const cName = charInfo.rows[0]?.name ?? '???';
          const prefixNameList = prefixIds.length > 0
            ? (await query<{ name: string }>('SELECT name FROM item_prefixes WHERE id = ANY($1)', [prefixIds])).rows.map(r => r.name).join(' ')
            : '';
          const fullName = prefixNameList ? `${prefixNameList} ${iName}` : iName;
          await query(
            `INSERT INTO item_drop_log (character_id, character_name, item_name, item_grade, prefix_count, prefix_names)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [characterId, cName, fullName, grade, prefixIds.length, prefixNameList]
          );
        }
      }
    } else {
      await query(
        'INSERT INTO character_inventory (character_id, item_id, slot_index, quantity) VALUES ($1, $2, $3, $4)',
        [characterId, itemId, slot, qty]
      );
    }
    remaining -= qty;
  }

  return { added: quantity - remaining, overflow: remaining };
}

export async function deliverToMailbox(
  characterId: number,
  subject: string,
  body: string,
  itemId: number,
  quantity: number,
  gold: number = 0
) {
  // itemId 0 → 단순 알림 (아이템 없음)
  if (itemId > 0) {
    await query(
      `INSERT INTO mailbox (character_id, subject, body, item_id, item_quantity, gold)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [characterId, subject, body, itemId, quantity, gold]
    );
  } else {
    await query(
      `INSERT INTO mailbox (character_id, subject, body, gold)
       VALUES ($1, $2, $3, $4)`,
      [characterId, subject, body, gold]
    );
  }
}
