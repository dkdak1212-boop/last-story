import { Router, type Response } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { addItemToInventory } from '../game/inventory.js';

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

// 우편물 일괄 수령 (claim-all을 :mailId/claim 보다 먼저 등록해야 라우트 충돌 방지)
router.post('/:id/mailbox/claim-all', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const unclaimed = await query<{ id: number; item_id: number | null; item_quantity: number | null; gold: string | null }>(
    `SELECT id, item_id, item_quantity, gold FROM mailbox
     WHERE character_id = $1 AND read_at IS NULL AND expires_at > NOW()
     ORDER BY created_at ASC`,
    [id]
  );

  let claimed = 0;
  let failed = 0;

  for (const m of unclaimed.rows) {
    try {
      if (m.item_id && m.item_quantity) {
        const { overflow } = await addItemToInventory(id, m.item_id, m.item_quantity);
        if (overflow > 0) { failed++; continue; }
      }
      if (m.gold && Number(m.gold) > 0) {
        await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [m.gold, id]);
      }
      await query('UPDATE mailbox SET read_at = NOW() WHERE id = $1', [m.id]);
      claimed++;
    } catch {
      failed++;
    }
  }

  res.json({ ok: true, claimed, failed });
});

// 우편물 수령
router.post('/:id/mailbox/:mailId/claim', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const mailId = Number(req.params.mailId);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const r = await query<{ item_id: number | null; item_quantity: number | null; gold: string | null; read_at: string | null }>(
    'SELECT item_id, item_quantity, gold, read_at FROM mailbox WHERE id = $1 AND character_id = $2',
    [mailId, id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'mail not found' });
  if (r.rows[0].read_at) return res.status(400).json({ error: 'already claimed' });

  const m = r.rows[0];
  if (m.item_id && m.item_quantity) {
    const { overflow } = await addItemToInventory(id, m.item_id, m.item_quantity);
    if (overflow > 0) return res.status(400).json({ error: 'inventory full' });
  }
  if (m.gold && Number(m.gold) > 0) {
    await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [m.gold, id]);
  }
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
