import { query } from '../db/pool.js';
import { generatePrefixes } from './prefix.js';

export const BASE_INVENTORY_SLOTS = 300;

async function getMaxSlots(characterId: number): Promise<number> {
  const r = await query<{ bonus: number }>(
    `SELECT inventory_slots_bonus AS bonus FROM characters WHERE id = $1`, [characterId]
  );
  return BASE_INVENTORY_SLOTS + (r.rows[0]?.bonus || 0);
}

export async function addItemToInventory(
  characterId: number,
  itemId: number,
  quantity: number,
  mailOnOverflow?: { subject: string; body: string }
): Promise<{ added: number; overflow: number }> {
  // 아이템 조회 — 스택 가능 여부 + 장비 여부 + 유니크 여부
  const itemR = await query<{ stack_size: number; slot: string | null; required_level: number; grade: string; unique_prefix_stats: Record<string, number> | null; name: string }>(
    'SELECT stack_size, slot, COALESCE(required_level, 1) AS required_level, grade, unique_prefix_stats, name FROM items WHERE id = $1',
    [itemId]
  );
  if (itemR.rowCount === 0) return { added: 0, overflow: quantity };
  const stackSize = itemR.rows[0].stack_size;
  const isEquipment = !!itemR.rows[0].slot;
  const itemRequiredLevel = itemR.rows[0].required_level;
  const itemGrade = itemR.rows[0].grade;
  const uniquePrefixStats = itemR.rows[0].unique_prefix_stats;
  const itemName = itemR.rows[0].name;
  const isUnique = itemGrade === 'unique';

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
      // 공통: 접두사 + 품질 생성
      const { prefixIds, bonusStats, maxTier } = await generatePrefixes(itemRequiredLevel);
      const quality = Math.floor(Math.random() * 101); // 0~100
      let finalPrefixStats: Record<string, number> = bonusStats;

      if (isUnique) {
        // 유니크: 고정 특수옵션 + 랜덤 접두사 스탯 합치기
        const fixedStats = uniquePrefixStats || {};
        finalPrefixStats = { ...fixedStats };
        for (const [k, v] of Object.entries(bonusStats)) {
          finalPrefixStats[k] = (finalPrefixStats[k] || 0) + (v as number);
        }
      }

      await query(
        `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, prefix_ids, prefix_stats, quality)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [characterId, itemId, slot, qty, prefixIds.length > 0 ? prefixIds : [], JSON.stringify(finalPrefixStats), quality]
      );

      // 축하 드롭 로그: 유니크 / 품질 100% / 3옵 / T4 접두사
      const isQualityMax = quality >= 100;
      const is3Options = prefixIds.length >= 3;
      const isT4 = maxTier >= 4;
      if (isUnique || isQualityMax || is3Options || isT4) {
        const charInfo = await query<{ name: string }>('SELECT name FROM characters WHERE id = $1', [characterId]);
        const cName = charInfo.rows[0]?.name ?? '???';
        const prefixNameList = prefixIds.length > 0
          ? (await query<{ name: string }>('SELECT name FROM item_prefixes WHERE id = ANY($1)', [prefixIds])).rows.map(r => r.name).join(' ')
          : '';
        const fullName = prefixNameList ? `${prefixNameList} ${itemName}` : itemName;
        const logGrade = isUnique ? 'unique' : itemGrade;
        await query(
          `INSERT INTO item_drop_log (character_id, character_name, item_name, item_grade, prefix_count, prefix_names, quality, max_prefix_tier)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [characterId, cName, fullName, logGrade, prefixIds.length, prefixNameList, quality, maxTier]
        );
      }
    } else {
      await query(
        'INSERT INTO character_inventory (character_id, item_id, slot_index, quantity) VALUES ($1, $2, $3, $4)',
        [characterId, itemId, slot, qty]
      );
    }
    remaining -= qty;
  }

  // 인벤토리 가득 → 장비라면 접두사/품질 보존하여 우편으로 발송
  if (remaining > 0 && mailOnOverflow && isEquipment) {
    for (let i = 0; i < remaining; i++) {
      const { prefixIds, bonusStats } = await generatePrefixes(itemRequiredLevel);
      const quality = Math.floor(Math.random() * 101);
      let finalPrefixStats: Record<string, number> = bonusStats;
      if (isUnique) {
        const fixedStats = uniquePrefixStats || {};
        finalPrefixStats = { ...fixedStats };
        for (const [k, v] of Object.entries(bonusStats)) {
          finalPrefixStats[k] = (finalPrefixStats[k] || 0) + (v as number);
        }
      }
      await deliverToMailbox(
        characterId,
        mailOnOverflow.subject,
        mailOnOverflow.body,
        itemId,
        1,
        0,
        {
          enhanceLevel: 0,
          prefixIds: prefixIds.length > 0 ? prefixIds : null,
          prefixStats: finalPrefixStats,
          quality,
        }
      );
    }
    remaining = 0;
  }

  return { added: quantity - remaining, overflow: remaining };
}

// 우편 수령용: 접두사 생성 없이 순수 아이템만 인벤토리에 넣기
export async function addItemToInventoryPlain(
  characterId: number,
  itemId: number,
  quantity: number
): Promise<{ added: number; overflow: number }> {
  const itemR = await query<{ stack_size: number }>('SELECT stack_size FROM items WHERE id = $1', [itemId]);
  if (itemR.rowCount === 0) return { added: 0, overflow: quantity };
  const stackSize = itemR.rows[0].stack_size;

  let remaining = quantity;

  // 기존 스택에 합치기
  if (stackSize > 1) {
    const existing = await query<{ id: number; quantity: number }>(
      `SELECT id, quantity FROM character_inventory WHERE character_id = $1 AND item_id = $2 AND quantity < $3 ORDER BY slot_index ASC`,
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

  // 새 슬롯
  const usedR = await query<{ slot_index: number }>('SELECT slot_index FROM character_inventory WHERE character_id = $1', [characterId]);
  const used = new Set(usedR.rows.map(r => r.slot_index));
  const maxSlots = await getMaxSlots(characterId);

  while (remaining > 0) {
    let freeSlot = -1;
    for (let i = 0; i < maxSlots; i++) if (!used.has(i)) { freeSlot = i; break; }
    if (freeSlot < 0) break;
    used.add(freeSlot);
    const qty = Math.min(remaining, stackSize);
    await query(
      'INSERT INTO character_inventory (character_id, item_id, slot_index, quantity) VALUES ($1, $2, $3, $4)',
      [characterId, itemId, freeSlot, qty]
    );
    remaining -= qty;
  }

  return { added: quantity - remaining, overflow: remaining };
}

// 같은 캐릭터의 같은 아이템 여러 row를 1개 row로 합치기 (스택 한도 내).
// stack_size 한도를 넘으면 여러 stack으로 균등 분배.
export async function compactInventoryStacks(characterId: number, itemId: number): Promise<void> {
  const itemR = await query<{ stack_size: number }>('SELECT stack_size FROM items WHERE id = $1', [itemId]);
  if (itemR.rowCount === 0) return;
  const stackSize = itemR.rows[0].stack_size;
  if (stackSize <= 1) return;

  const rows = await query<{ id: number; quantity: number }>(
    'SELECT id, quantity FROM character_inventory WHERE character_id = $1 AND item_id = $2 ORDER BY slot_index ASC',
    [characterId, itemId]
  );
  if (rows.rowCount === null || rows.rowCount <= 1) return;

  const total = rows.rows.reduce((s, r) => s + r.quantity, 0);
  // 첫 row를 keeper로, 나머지는 정리 후 재할당 (필요 시 추가 stack)
  const keepers = rows.rows.slice(0, Math.ceil(total / stackSize));
  const trash = rows.rows.slice(keepers.length);
  let remaining = total;
  for (const k of keepers) {
    const q = Math.min(remaining, stackSize);
    await query('UPDATE character_inventory SET quantity = $1 WHERE id = $2', [q, k.id]);
    remaining -= q;
  }
  if (trash.length > 0) {
    const ids = trash.map(t => t.id);
    await query('DELETE FROM character_inventory WHERE id = ANY($1::int[])', [ids]);
  }
}

export interface MailItemOptions {
  enhanceLevel?: number;
  prefixIds?: number[] | null;
  prefixStats?: Record<string, number> | null;
  quality?: number;
}

export async function deliverToMailbox(
  characterId: number,
  subject: string,
  body: string,
  itemId: number,
  quantity: number,
  gold: number = 0,
  options?: MailItemOptions
) {
  // itemId 0 → 단순 알림 (아이템 없음)
  if (itemId > 0) {
    await query(
      `INSERT INTO mailbox (character_id, subject, body, item_id, item_quantity, gold,
                             enhance_level, prefix_ids, prefix_stats, quality)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
      [
        characterId, subject, body, itemId, quantity, gold,
        options?.enhanceLevel ?? null,
        options?.prefixIds && options.prefixIds.length > 0 ? options.prefixIds : null,
        options?.prefixStats ? JSON.stringify(options.prefixStats) : null,
        options?.quality ?? null,
      ]
    );
  } else {
    await query(
      `INSERT INTO mailbox (character_id, subject, body, gold)
       VALUES ($1, $2, $3, $4)`,
      [characterId, subject, body, gold]
    );
  }
}
