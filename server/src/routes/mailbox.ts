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
  const r = await query<{ item_id: number | null; item_quantity: number | null; gold: string | null; read_at: string | null }>(
    'SELECT item_id, item_quantity, gold, read_at FROM mailbox WHERE id = $1 AND character_id = $2',
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
      for (let i = 0; i < m.item_quantity; i++) {
        const usedR = await query<{ slot_index: number }>(
          'SELECT slot_index FROM character_inventory WHERE character_id = $1', [id]
        );
        const used = new Set(usedR.rows.map(r => r.slot_index));
        let freeSlot = -1;
        for (let s = 0; s < 300; s++) if (!used.has(s)) { freeSlot = s; break; }
        if (freeSlot < 0) return res.status(400).json({ error: 'inventory full' });
        await query(
          'INSERT INTO character_inventory (character_id, item_id, slot_index, quantity) VALUES ($1, $2, $3, 1)',
          [id, m.item_id, freeSlot]
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
  if (m.gold && Number(m.gold) > 0) {
    await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [m.gold, id]);
  }

  // 수령 처리
  await query('UPDATE mailbox SET read_at = NOW() WHERE id = $1', [mailId]);
  res.json({ ok: true });
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
