import { Router, type Response } from 'express';
import { z } from 'zod';
import { query, withTransaction, type TxOk, type TxErr } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { displayPrefixStats } from '../game/prefix.js';

const router = Router();
router.use(authRequired);

// 길드 창고 기능 영구 비활성화 — 모든 요청 차단
router.use((_req, res) => {
  res.status(403).json({ error: '길드 창고 기능이 비활성화되었습니다.' });
});

const STORAGE_BASE_SLOTS = 50;
const MAX_LOG_ENTRIES = 50;

// 가입한 길드 id 조회 (미가입 시 null)
async function getGuildIdForChar(characterId: number): Promise<number | null> {
  const r = await query<{ guild_id: number | null }>(
    `SELECT guild_id FROM guild_members WHERE character_id = $1 LIMIT 1`, [characterId]
  );
  return r.rows[0]?.guild_id ?? null;
}

async function maxStorageSlots(guildId: number): Promise<number> {
  const r = await query<{ bonus: number }>(
    'SELECT COALESCE(storage_slots_bonus, 0) AS bonus FROM guilds WHERE id = $1', [guildId]
  );
  return STORAGE_BASE_SLOTS + (r.rows[0]?.bonus || 0);
}

// 로그 추가 + 50건 초과 시 오래된 것 삭제
async function addLog(guildId: number, characterId: number, characterName: string, action: string, opts: { itemId?: number; itemName?: string; quantity?: number; gold?: number } = {}): Promise<void> {
  await query(
    `INSERT INTO guild_storage_logs (guild_id, character_id, character_name, action, item_id, item_name, quantity, gold)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [guildId, characterId, characterName, action, opts.itemId ?? null, opts.itemName ?? null, opts.quantity ?? 0, opts.gold ?? 0]
  );
  // 초과분 삭제
  await query(
    `DELETE FROM guild_storage_logs WHERE guild_id = $1 AND id NOT IN (
       SELECT id FROM guild_storage_logs WHERE guild_id = $1 ORDER BY id DESC LIMIT $2
     )`,
    [guildId, MAX_LOG_ENTRIES]
  );
}

// ============================================================
// GET /guild-storage/:characterId — 조회
// ============================================================
router.get('/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const guildId = await getGuildIdForChar(cid);
  if (!guildId) return res.status(400).json({ error: '길드 미가입' });

  // 아이템
  const itemsR = await query<{
    id: number; slot_index: number; item_id: number; quantity: number;
    enhance_level: number; prefix_ids: number[] | null;
    prefix_stats: Record<string, number> | null; quality: number;
    deposited_by_character_id: number | null; deposited_by_name: string | null;
    deposited_at: string;
    item_name: string; item_grade: string; item_slot: string | null;
    item_type: string; item_description: string;
    item_stats: Record<string, number> | null; class_restriction: string | null;
    required_level: number;
  }>(
    `SELECT s.id, s.slot_index, s.item_id, s.quantity, s.enhance_level, s.prefix_ids, s.prefix_stats, s.quality,
            s.deposited_by_character_id, s.deposited_by_name, s.deposited_at,
            i.name AS item_name, i.grade AS item_grade, i.slot AS item_slot, i.type AS item_type,
            i.description AS item_description, i.stats AS item_stats, i.class_restriction,
            COALESCE(i.required_level, 1) AS required_level
     FROM guild_storage_items s JOIN items i ON i.id = s.item_id
     WHERE s.guild_id = $1 ORDER BY s.slot_index`,
    [guildId]
  );
  // 접두사 이름
  const allPrefixIds = [...new Set(itemsR.rows.flatMap(r => r.prefix_ids || []))];
  const prefixInfoMap = new Map<number, { name: string; tier: number; statKey: string }>();
  if (allPrefixIds.length > 0) {
    const pr = await query<{ id: number; name: string; tier: number; stat_key: string }>(
      'SELECT id, name, tier, stat_key FROM item_prefixes WHERE id = ANY($1::int[])', [allPrefixIds]
    );
    for (const p of pr.rows) prefixInfoMap.set(p.id, { name: p.name, tier: p.tier, statKey: p.stat_key });
  }
  function buildPrefixName(ids: number[]): string {
    return ids.map(id => prefixInfoMap.get(id)?.name).filter(Boolean).join(' ');
  }
  function buildPrefixTiers(ids: number[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const id of ids) {
      const info = prefixInfoMap.get(id);
      if (!info) continue;
      if (!result[info.statKey] || result[info.statKey] < info.tier) result[info.statKey] = info.tier;
    }
    return result;
  }

  // 골드 (guilds.treasury 재사용)
  const treasuryR = await query<{ treasury: string; name: string }>(
    'SELECT treasury::text, name FROM guilds WHERE id = $1', [guildId]
  );
  const treasury = Number(treasuryR.rows[0]?.treasury || 0);
  const guildName = treasuryR.rows[0]?.name || '';

  // 요청 캐릭의 길드 내 역할 (length 출금 권한 판정용)
  const roleR = await query<{ role: string }>(
    `SELECT role FROM guild_members WHERE character_id = $1 LIMIT 1`, [cid]
  );
  const isLeader = roleR.rows[0]?.role === 'leader';

  // 최근 50건 로그
  const logsR = await query<{
    id: number; character_name: string; action: string;
    item_id: number | null; item_name: string | null; quantity: number; gold: string;
    created_at: string;
  }>(
    `SELECT id, character_name, action, item_id, item_name, quantity, gold::text, created_at
     FROM guild_storage_logs WHERE guild_id = $1 ORDER BY id DESC LIMIT ${MAX_LOG_ENTRIES}`,
    [guildId]
  );

  const maxSlots = await maxStorageSlots(guildId);
  res.json({
    guildId,
    guildName,
    maxSlots,
    treasury,
    isLeader,
    items: itemsR.rows.map(r => {
      const pIds = r.prefix_ids || [];
      return {
        id: r.id,
        slotIndex: r.slot_index,
        itemId: r.item_id,
        quantity: r.quantity,
        enhanceLevel: r.enhance_level,
        prefixIds: pIds,
        prefixStats: displayPrefixStats(r.prefix_stats, r.enhance_level || 0),
        prefixName: buildPrefixName(pIds),
        prefixTiers: buildPrefixTiers(pIds),
        quality: r.quality,
        depositedByName: r.deposited_by_name,
        depositedAt: r.deposited_at,
        itemName: r.item_name,
        grade: r.item_grade,
        slot: r.item_slot,
        type: r.item_type,
        description: r.item_description,
        stats: r.item_stats,
        classRestriction: r.class_restriction,
        requiredLevel: r.required_level,
      };
    }),
    logs: logsR.rows.map(r => ({
      id: r.id,
      characterName: r.character_name,
      action: r.action,
      itemId: r.item_id,
      itemName: r.item_name,
      quantity: r.quantity,
      gold: Number(r.gold),
      createdAt: r.created_at,
    })),
  });
});

// ============================================================
// POST /guild-storage/:characterId/deposit-item {inventorySlotIndex}
// ============================================================
router.post('/:characterId/deposit-item', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const guildId = await getGuildIdForChar(cid);
  if (!guildId) return res.status(400).json({ error: '길드 미가입' });

  const parsed = z.object({ inventorySlotIndex: z.number().int().min(0) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { inventorySlotIndex } = parsed.data;

  const maxSlots = await maxStorageSlots(guildId);
  const result = await withTransaction<TxOk & { itemId?: number; itemName?: string; quantity?: number } | TxErr>(async (tx) => {
    const inv = await tx.query<{
      id: number; item_id: number; quantity: number; enhance_level: number;
      prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; quality: number;
      item_name: string; soulbound: boolean;
    }>(
      `SELECT ci.id, ci.item_id, ci.quantity, ci.enhance_level, ci.prefix_ids, ci.prefix_stats,
              COALESCE(ci.quality, 0) AS quality, i.name AS item_name,
              COALESCE(ci.soulbound, FALSE) AS soulbound
       FROM character_inventory ci JOIN items i ON i.id = ci.item_id
       WHERE ci.character_id = $1 AND ci.slot_index = $2 FOR UPDATE`,
      [cid, inventorySlotIndex]
    );
    if (inv.rowCount === 0) return { error: '아이템 없음', status: 404 };
    const it = inv.rows[0];
    if (it.soulbound) return { error: '착용한 적이 있는 장비는 길드 창고에 보관할 수 없습니다. (계정 귀속)', status: 400 };
    if (it.item_id === 320) return { error: '찢어진 스크롤은 길드 창고에 보관할 수 없습니다.', status: 400 };
    if (it.item_id === 321) return { error: '노드 스크롤 +8은 길드 창고에 보관할 수 없습니다.', status: 400 };

    const usedR = await tx.query<{ slot_index: number }>(
      'SELECT slot_index FROM guild_storage_items WHERE guild_id = $1', [guildId]
    );
    const used = new Set(usedR.rows.map(r => r.slot_index));
    let freeSlot = -1;
    for (let i = 0; i < maxSlots; i++) if (!used.has(i)) { freeSlot = i; break; }
    if (freeSlot < 0) return { error: '길드 창고가 가득 찼습니다', status: 400 };

    await tx.query(
      `INSERT INTO guild_storage_items (guild_id, slot_index, item_id, quantity, enhance_level, prefix_ids, prefix_stats, quality, deposited_by_character_id, deposited_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
      [guildId, freeSlot, it.item_id, it.quantity, it.enhance_level,
       it.prefix_ids || [], JSON.stringify(it.prefix_stats || {}), it.quality,
       cid, char.name]
    );
    await tx.query('DELETE FROM character_inventory WHERE id = $1', [it.id]);
    return { ok: true, itemId: it.item_id, itemName: it.item_name, quantity: it.quantity };
  });

  if ('error' in result) return res.status(result.status).json({ error: result.error });
  await addLog(guildId, cid, char.name, 'deposit_item', {
    itemId: result.itemId, itemName: result.itemName, quantity: result.quantity,
  }).catch(e => console.error('[guild-storage] log fail', e));
  res.json({ ok: true });
});

// ============================================================
// POST /guild-storage/:characterId/withdraw-item {storageItemId}
// ============================================================
router.post('/:characterId/withdraw-item', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const guildId = await getGuildIdForChar(cid);
  if (!guildId) return res.status(400).json({ error: '길드 미가입' });

  const parsed = z.object({ storageItemId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { storageItemId } = parsed.data;

  const result = await withTransaction<TxOk & { itemId?: number; itemName?: string; quantity?: number } | TxErr>(async (tx) => {
    const sr = await tx.query<{
      id: number; item_id: number; quantity: number; enhance_level: number;
      prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; quality: number;
      item_name: string;
    }>(
      `SELECT s.id, s.item_id, s.quantity, s.enhance_level, s.prefix_ids, s.prefix_stats,
              COALESCE(s.quality, 0) AS quality, i.name AS item_name
       FROM guild_storage_items s JOIN items i ON i.id = s.item_id
       WHERE s.id = $1 AND s.guild_id = $2 FOR UPDATE`,
      [storageItemId, guildId]
    );
    if (sr.rowCount === 0) return { error: '창고 아이템 없음', status: 404 };
    const it = sr.rows[0];

    const usedR = await tx.query<{ slot_index: number }>(
      'SELECT slot_index FROM character_inventory WHERE character_id = $1', [cid]
    );
    const used = new Set(usedR.rows.map(r => r.slot_index));
    let freeSlot = -1;
    for (let i = 0; i < 300; i++) if (!used.has(i)) { freeSlot = i; break; }
    if (freeSlot < 0) return { error: '인벤토리가 가득 찼습니다', status: 400 };

    await tx.query(
      `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, enhance_level, prefix_ids, prefix_stats, quality)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [cid, it.item_id, freeSlot, it.quantity, it.enhance_level,
       it.prefix_ids || [], JSON.stringify(it.prefix_stats || {}), it.quality]
    );
    await tx.query('DELETE FROM guild_storage_items WHERE id = $1', [it.id]);
    return { ok: true, itemId: it.item_id, itemName: it.item_name, quantity: it.quantity };
  });

  if ('error' in result) return res.status(result.status).json({ error: result.error });
  await addLog(guildId, cid, char.name, 'withdraw_item', {
    itemId: result.itemId, itemName: result.itemName, quantity: result.quantity,
  }).catch(e => console.error('[guild-storage] log fail', e));
  res.json({ ok: true });
});

// ============================================================
// POST /guild-storage/:characterId/deposit-gold {amount}
// ============================================================
router.post('/:characterId/deposit-gold', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const guildId = await getGuildIdForChar(cid);
  if (!guildId) return res.status(400).json({ error: '길드 미가입' });

  const parsed = z.object({ amount: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { amount } = parsed.data;

  const result = await withTransaction<TxOk | TxErr>(async (tx) => {
    const gr = await tx.query<{ gold: number }>(
      'SELECT gold FROM characters WHERE id = $1 FOR UPDATE', [cid]
    );
    if (Number(gr.rows[0].gold) < amount) return { error: '골드 부족', status: 400 };
    await tx.query('UPDATE characters SET gold = gold - $1 WHERE id = $2', [amount, cid]);
    await tx.query('UPDATE guilds SET treasury = treasury + $1 WHERE id = $2', [amount, guildId]);
    return { ok: true };
  });

  if ('error' in result) return res.status(result.status).json({ error: result.error });
  await addLog(guildId, cid, char.name, 'deposit_gold', { gold: amount })
    .catch(e => console.error('[guild-storage] log fail', e));
  res.json({ ok: true });
});

// ============================================================
// POST /guild-storage/:characterId/withdraw-gold {amount}
// ============================================================
router.post('/:characterId/withdraw-gold', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const guildId = await getGuildIdForChar(cid);
  if (!guildId) return res.status(400).json({ error: '길드 미가입' });

  // 길드장만 출금 가능
  const roleR = await query<{ role: string }>(
    `SELECT role FROM guild_members WHERE character_id = $1 LIMIT 1`, [cid]
  );
  if (roleR.rows[0]?.role !== 'leader') {
    return res.status(403).json({ error: '길드 금고 출금은 길드장만 가능합니다.' });
  }

  const parsed = z.object({ amount: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { amount } = parsed.data;

  const result = await withTransaction<TxOk | TxErr>(async (tx) => {
    const gr = await tx.query<{ treasury: string }>(
      'SELECT treasury::text FROM guilds WHERE id = $1 FOR UPDATE', [guildId]
    );
    const have = Number(gr.rows[0]?.treasury || 0);
    if (have < amount) return { error: '길드 금고 부족', status: 400 };
    await tx.query('UPDATE guilds SET treasury = treasury - $1 WHERE id = $2', [amount, guildId]);
    await tx.query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [amount, cid]);
    return { ok: true };
  });

  if ('error' in result) return res.status(result.status).json({ error: result.error });
  await addLog(guildId, cid, char.name, 'withdraw_gold', { gold: amount })
    .catch(e => console.error('[guild-storage] log fail', e));
  res.json({ ok: true });
});

export default router;
