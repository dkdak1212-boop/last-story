import { Router, type Response } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';

const router = Router();
router.use(authRequired);

// 우편함 목록
router.get('/:id/mailbox', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const r = await query<{
    id: number; subject: string; body: string;
    item_id: number | null; item_quantity: number | null;
    gold: number | string | null; read_at: string | null; created_at: string;
    item_name: string | null; item_grade: string | null;
  }>(
    `SELECT m.id, m.subject, m.body, m.item_id, m.item_quantity, m.gold,
            m.read_at, m.created_at, i.name AS item_name, i.grade AS item_grade
     FROM mailbox m LEFT JOIN items i ON i.id = m.item_id
     WHERE m.character_id = $1 AND m.expires_at > NOW()
     ORDER BY m.created_at DESC LIMIT 100`,
    [id]
  );
  res.json(r.rows.map(row => ({
    id: row.id, subject: row.subject, body: row.body,
    itemId: row.item_id, itemQuantity: row.item_quantity,
    itemName: row.item_name, itemGrade: row.item_grade,
    gold: row.gold ? Number(row.gold) : 0,
    readAt: row.read_at, createdAt: row.created_at,
    claimed: !!row.read_at,
  })));
});

// 우편물 수령 (단건만)
router.post('/:id/mailbox/:mailId/claim', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const mailId = Number(req.params.mailId);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 우편 조회 (이중 수령 방지)
  const r = await query<{
    item_id: number | null; item_quantity: number | null; gold: string | null; read_at: string | null;
    enhance_level: number | null; prefix_ids: number[] | null;
    prefix_stats: Record<string, number> | null; quality: number | null;
  }>(
    `SELECT item_id, item_quantity, gold, read_at, enhance_level, prefix_ids, prefix_stats, quality
     FROM mailbox WHERE id = $1 AND character_id = $2`,
    [mailId, id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'mail not found' });
  if (r.rows[0].read_at) return res.status(400).json({ error: 'already claimed' });

  const m = r.rows[0];

  // 아이템 지급 (직접 INSERT — 접두사 생성 없음)
  if (m.item_id && m.item_id > 0 && m.item_quantity && m.item_quantity > 0) {
    // 아이템 정보 확인
    const itemR = await query<{ stack_size: number; slot: string | null }>(
      'SELECT stack_size, slot FROM items WHERE id = $1', [m.item_id]
    );
    if (itemR.rowCount === 0) return res.status(400).json({ error: 'item not found' });
    const isEquipment = !!itemR.rows[0].slot;
    const stackSize = itemR.rows[0].stack_size;

    if (isEquipment) {
      // 장비: 항상 새 슬롯에 1개씩 (스택 불가)
      // 우편함에 저장된 옵션(강화/접두사/품질) 보존
      const enhLv = m.enhance_level ?? 0;
      const pIds = m.prefix_ids && m.prefix_ids.length > 0 ? m.prefix_ids : [];
      const pStatsJson = m.prefix_stats ? JSON.stringify(m.prefix_stats) : '{}';
      const qual = m.quality ?? 0;

      for (let i = 0; i < m.item_quantity; i++) {
        const usedR = await query<{ slot_index: number }>(
          'SELECT slot_index FROM character_inventory WHERE character_id = $1', [id]
        );
        const used = new Set(usedR.rows.map(r => r.slot_index));
        let freeSlot = -1;
        for (let s = 0; s < 300; s++) if (!used.has(s)) { freeSlot = s; break; }
        if (freeSlot < 0) return res.status(400).json({ error: 'inventory full' });
        await query(
          `INSERT INTO character_inventory
             (character_id, item_id, slot_index, quantity, enhance_level, prefix_ids, prefix_stats, quality)
           VALUES ($1, $2, $3, 1, $4, $5, $6::jsonb, $7)`,
          [id, m.item_id, freeSlot, enhLv, pIds, pStatsJson, qual]
        );
      }
    } else {
      // 소비/재료: 기존 스택에 합치기 시도
      let remaining = m.item_quantity;

      if (stackSize > 1) {
        const existing = await query<{ id: number; quantity: number }>(
          `SELECT id, quantity FROM character_inventory WHERE character_id = $1 AND item_id = $2 AND quantity < $3 ORDER BY slot_index`,
          [id, m.item_id, stackSize]
        );
        for (const row of existing.rows) {
          if (remaining <= 0) break;
          const canAdd = Math.min(remaining, stackSize - row.quantity);
          await query('UPDATE character_inventory SET quantity = quantity + $1 WHERE id = $2', [canAdd, row.id]);
          remaining -= canAdd;
        }
      }

      // 남은 수량 새 슬롯에
      while (remaining > 0) {
        const usedR = await query<{ slot_index: number }>(
          'SELECT slot_index FROM character_inventory WHERE character_id = $1', [id]
        );
        const used = new Set(usedR.rows.map(r => r.slot_index));
        let freeSlot = -1;
        for (let s = 0; s < 300; s++) if (!used.has(s)) { freeSlot = s; break; }
        if (freeSlot < 0) return res.status(400).json({ error: 'inventory full' });
        const qty = Math.min(remaining, stackSize);
        await query(
          'INSERT INTO character_inventory (character_id, item_id, slot_index, quantity) VALUES ($1, $2, $3, $4)',
          [id, m.item_id, freeSlot, qty]
        );
        remaining -= qty;
      }
    }
  }

  // 골드 지급
  const goldNum = Number(m.gold || 0);
  if (goldNum > 0) {
    await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [goldNum, id]);
  }

  // 수령 처리
  await query('UPDATE mailbox SET read_at = NOW() WHERE id = $1', [mailId]);
  res.json({ ok: true });
});

// 우편 보내기 (골드/아이템)
router.post('/:id/mailbox/send', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const { z } = await import('zod');
  const parsed = z.object({
    recipientName: z.string().min(1).max(20),
    gold: z.number().int().min(0).default(0),
    slotIndex: z.number().int().min(-1).default(-1), // -1이면 아이템 없음
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const { recipientName, gold, slotIndex } = parsed.data;
  if (gold <= 0 && slotIndex < 0) return res.status(400).json({ error: '골드 또는 아이템을 선택해주세요.' });

  // 수신자 조회
  const recipR = await query<{ id: number; name: string }>(
    'SELECT id, name FROM characters WHERE name = $1', [recipientName]
  );
  if (recipR.rowCount === 0) return res.status(404).json({ error: `"${recipientName}" 캐릭터를 찾을 수 없습니다.` });
  const recipient = recipR.rows[0];
  if (recipient.id === id) return res.status(400).json({ error: '자기 자신에게는 보낼 수 없습니다.' });

  // 골드 차감
  if (gold > 0) {
    if (char.gold < gold) return res.status(400).json({ error: '골드가 부족합니다.' });
    await query('UPDATE characters SET gold = gold - $1 WHERE id = $2', [gold, id]);
  }

  // 아이템 처리
  let itemId = 0;
  let itemQty = 0;
  let enhLv = 0;
  let prefixIds: number[] | null = null;
  let prefixStats: Record<string, number> | null = null;
  let quality = 0;
  let itemName = '';

  if (slotIndex >= 0) {
    const inv = await query<{
      id: number; item_id: number; quantity: number; locked: boolean;
      enhance_level: number; prefix_ids: number[] | null;
      prefix_stats: Record<string, number> | null; quality: number;
    }>(
      `SELECT id, item_id, quantity, locked, enhance_level, prefix_ids, prefix_stats, COALESCE(quality, 0) AS quality
       FROM character_inventory WHERE character_id = $1 AND slot_index = $2`,
      [id, slotIndex]
    );
    if (inv.rowCount === 0) return res.status(404).json({ error: '아이템이 없습니다.' });
    const slot = inv.rows[0];
    if (slot.locked) return res.status(400).json({ error: '잠긴 아이템은 보낼 수 없습니다.' });
    if (slot.item_id === 320) return res.status(400).json({ error: '찢어진 스크롤은 우편으로 보낼 수 없습니다.' });

    const itemInfo = await query<{ name: string }>('SELECT name FROM items WHERE id = $1', [slot.item_id]);
    itemName = itemInfo.rows[0]?.name || '';

    itemId = slot.item_id;
    itemQty = slot.quantity;
    enhLv = slot.enhance_level || 0;
    prefixIds = slot.prefix_ids;
    prefixStats = slot.prefix_stats;
    quality = slot.quality;

    // 인벤토리에서 제거
    await query('DELETE FROM character_inventory WHERE id = $1', [slot.id]);
  }

  // 우편 생성
  const subject = `${char.name}님의 선물`;
  const parts: string[] = [];
  if (itemName) parts.push(`아이템: ${itemName}`);
  if (gold > 0) parts.push(`골드: ${gold.toLocaleString()}G`);
  const body = parts.join(', ');

  await query(
    `INSERT INTO mailbox (character_id, subject, body, item_id, item_quantity, gold,
                           enhance_level, prefix_ids, prefix_stats, quality)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
    [
      recipient.id, subject, body,
      itemId > 0 ? itemId : null,
      itemQty > 0 ? itemQty : null,
      gold,
      enhLv || null,
      prefixIds && prefixIds.length > 0 ? prefixIds : null,
      prefixStats ? JSON.stringify(prefixStats) : null,
      quality || null,
    ]
  );

  res.json({ ok: true, recipientName: recipient.name });
});

// 우편물 삭제
router.post('/:id/mailbox/:mailId/delete', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const mailId = Number(req.params.mailId);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  await query('DELETE FROM mailbox WHERE id = $1 AND character_id = $2', [mailId, id]);
  res.json({ ok: true });
});

export default router;
