import { Router, type Response } from 'express';
import { query, withTransaction, type TxOk, type TxErr } from '../db/pool.js';
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

  const result = await withTransaction<TxOk | TxErr>(async (tx) => {
    const r = await tx.query<{
      item_id: number | null; item_quantity: number | null; gold: string | null; read_at: string | null;
      enhance_level: number | null; prefix_ids: number[] | null;
      prefix_stats: Record<string, number> | null; quality: number | null;
    }>(
      `SELECT item_id, item_quantity, gold, read_at, enhance_level, prefix_ids, prefix_stats, quality
       FROM mailbox WHERE id = $1 AND character_id = $2 FOR UPDATE`,
      [mailId, id]
    );
    if (r.rowCount === 0) return { error: 'mail not found', status: 404 };
    if (r.rows[0].read_at) return { error: 'already claimed', status: 400 };

    await tx.query('UPDATE mailbox SET read_at = NOW() WHERE id = $1', [mailId]);

    const m = r.rows[0];

    if (m.item_id && m.item_id > 0 && m.item_quantity && m.item_quantity > 0) {
      const itemR = await tx.query<{ stack_size: number; slot: string | null }>(
        'SELECT stack_size, slot FROM items WHERE id = $1', [m.item_id]
      );
      if (itemR.rowCount === 0) return { error: 'item not found', status: 400 };
      const isEquipment = !!itemR.rows[0].slot;
      const stackSize = itemR.rows[0].stack_size;

      if (isEquipment) {
        const enhLv = m.enhance_level ?? 0;
        const pIds = m.prefix_ids && m.prefix_ids.length > 0 ? m.prefix_ids : [];
        const pStatsJson = m.prefix_stats ? JSON.stringify(m.prefix_stats) : '{}';
        const qual = m.quality ?? 0;

        for (let i = 0; i < m.item_quantity; i++) {
          const usedR = await tx.query<{ slot_index: number }>(
            'SELECT slot_index FROM character_inventory WHERE character_id = $1', [id]
          );
          const used = new Set(usedR.rows.map(r => r.slot_index));
          let freeSlot = -1;
          for (let s = 0; s < 300; s++) if (!used.has(s)) { freeSlot = s; break; }
          if (freeSlot < 0) return { error: 'inventory full', status: 400 };
          await tx.query(
            `INSERT INTO character_inventory
               (character_id, item_id, slot_index, quantity, enhance_level, prefix_ids, prefix_stats, quality)
             VALUES ($1, $2, $3, 1, $4, $5, $6::jsonb, $7)`,
            [id, m.item_id, freeSlot, enhLv, pIds, pStatsJson, qual]
          );
        }
      } else if (m.item_id >= 846 && m.item_id <= 851) {
        // 차원새싹상자 (소비형) — 거래불가 플래그 TRUE 로 인벤 삽입
        let remaining = m.item_quantity;
        while (remaining > 0) {
          const usedR = await tx.query<{ slot_index: number }>(
            'SELECT slot_index FROM character_inventory WHERE character_id = $1', [id]
          );
          const used = new Set(usedR.rows.map(r => r.slot_index));
          let freeSlot = -1;
          for (let s = 0; s < 300; s++) if (!used.has(s)) { freeSlot = s; break; }
          if (freeSlot < 0) return { error: 'inventory full', status: 400 };
          await tx.query(
            `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, soulbound)
             VALUES ($1, $2, $3, 1, TRUE)`,
            [id, m.item_id, freeSlot]
          );
          remaining -= 1;
        }
      } else {
        let remaining = m.item_quantity;

        if (stackSize > 1) {
          const existing = await tx.query<{ id: number; quantity: number }>(
            `SELECT id, quantity FROM character_inventory WHERE character_id = $1 AND item_id = $2 AND quantity < $3 ORDER BY slot_index`,
            [id, m.item_id, stackSize]
          );
          for (const row of existing.rows) {
            if (remaining <= 0) break;
            const canAdd = Math.min(remaining, stackSize - row.quantity);
            await tx.query('UPDATE character_inventory SET quantity = quantity + $1 WHERE id = $2', [canAdd, row.id]);
            remaining -= canAdd;
          }
        }

        while (remaining > 0) {
          const usedR = await tx.query<{ slot_index: number }>(
            'SELECT slot_index FROM character_inventory WHERE character_id = $1', [id]
          );
          const used = new Set(usedR.rows.map(r => r.slot_index));
          let freeSlot = -1;
          for (let s = 0; s < 300; s++) if (!used.has(s)) { freeSlot = s; break; }
          if (freeSlot < 0) return { error: 'inventory full', status: 400 };
          const qty = Math.min(remaining, stackSize);
          await tx.query(
            'INSERT INTO character_inventory (character_id, item_id, slot_index, quantity) VALUES ($1, $2, $3, $4)',
            [id, m.item_id, freeSlot, qty]
          );
          remaining -= qty;
        }
      }
    }

    const goldNum = Number(m.gold || 0);
    if (goldNum > 0) {
      await tx.query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [goldNum, id]);
    }

    return { ok: true };
  });

  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

// 우편 보내기 — 영구 비활성화 (다계정 자금세탁 차단)
router.post('/:id/mailbox/send', async (_req: AuthedRequest, res: Response) => {
  return res.status(403).json({ error: '유저간 우편 발송 기능이 비활성화되었습니다.' });
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
