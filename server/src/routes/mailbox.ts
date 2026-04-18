import { Router, type Response } from 'express';
import { query, withTransaction, type TxOk, type TxErr } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import {
  getClientIp, getLatestUserIp, sameIpBlocked,
  getAccountAgeDays, getTodayGoldSent, ANTIFRAUD_CONST,
} from '../middleware/antifraud.js';

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

  const recipR = await query<{ id: number; name: string; user_id: number }>(
    'SELECT id, name, user_id FROM characters WHERE name = $1', [recipientName]
  );
  if (recipR.rowCount === 0) return res.status(404).json({ error: `"${recipientName}" 캐릭터를 찾을 수 없습니다.` });
  const recipient = recipR.rows[0];
  if (recipient.id === id) return res.status(400).json({ error: '자기 자신에게는 보낼 수 없습니다.' });
  if (recipient.user_id === req.userId) {
    return res.status(400).json({ error: '같은 계정 간에는 우편을 보낼 수 없습니다.' });
  }

  // 다계정 우편 거래 방지 (Tier 1)
  // 1) 발신 캐릭터 Lv.30 이상
  if (char.level < ANTIFRAUD_CONST.MIN_TRADE_LEVEL) {
    return res.status(400).json({ error: `Lv.${ANTIFRAUD_CONST.MIN_TRADE_LEVEL} 이상만 우편을 보낼 수 있습니다.` });
  }
  // 2) 골드 발송 시 계정 생성 7일 이상
  if (gold > 0) {
    const ageDays = await getAccountAgeDays(req.userId!);
    if (ageDays < ANTIFRAUD_CONST.NEW_ACCOUNT_DAYS) {
      return res.status(400).json({ error: `계정 생성 후 ${ANTIFRAUD_CONST.NEW_ACCOUNT_DAYS}일이 지나야 골드 송금이 가능합니다.` });
    }
    // 3) 일일 골드 송금 한도 1억
    const todaySent = await getTodayGoldSent(id);
    if (todaySent + gold > ANTIFRAUD_CONST.DAILY_GOLD_SEND_CAP) {
      const remain = Math.max(0, ANTIFRAUD_CONST.DAILY_GOLD_SEND_CAP - todaySent);
      return res.status(400).json({
        error: `일일 골드 송금 한도 초과 (하루 ${ANTIFRAUD_CONST.DAILY_GOLD_SEND_CAP.toLocaleString()}G). 오늘 남은 한도 ${remain.toLocaleString()}G`,
      });
    }
  }
  // 4) 같은 IP 차단 — 발신자 현재 IP vs 수신자 계정의 최근 로그인 IP
  {
    const myIp = getClientIp(req);
    const recipIp = await getLatestUserIp(recipient.user_id);
    if (sameIpBlocked(myIp, recipIp)) {
      return res.status(400).json({ error: '같은 IP에서 접속한 계정에는 우편을 보낼 수 없습니다.' });
    }
  }

  const result = await withTransaction<TxOk | TxErr>(async (tx) => {
    if (gold > 0) {
      const gr = await tx.query<{ gold: number }>(
        'SELECT gold FROM characters WHERE id = $1 FOR UPDATE', [id]
      );
      if (gr.rows[0].gold < gold) return { error: '골드가 부족합니다.', status: 400 };
      await tx.query('UPDATE characters SET gold = gold - $1 WHERE id = $2', [gold, id]);
    }

    let itemId = 0;
    let itemQty = 0;
    let enhLv = 0;
    let prefixIds: number[] | null = null;
    let prefixStats: Record<string, number> | null = null;
    let quality = 0;
    let itemName = '';

    if (slotIndex >= 0) {
      const inv = await tx.query<{
        id: number; item_id: number; quantity: number; locked: boolean;
        enhance_level: number; prefix_ids: number[] | null;
        prefix_stats: Record<string, number> | null; quality: number;
      }>(
        `SELECT id, item_id, quantity, locked, enhance_level, prefix_ids, prefix_stats, COALESCE(quality, 0) AS quality
         FROM character_inventory WHERE character_id = $1 AND slot_index = $2 FOR UPDATE`,
        [id, slotIndex]
      );
      if (inv.rowCount === 0) return { error: '아이템이 없습니다.', status: 404 };
      const slot = inv.rows[0];
      if (slot.locked) return { error: '잠긴 아이템은 보낼 수 없습니다.', status: 400 };
      if (slot.item_id === 320) return { error: '찢어진 스크롤은 우편으로 보낼 수 없습니다.', status: 400 };
      if (slot.item_id === 321) return { error: '노드 스크롤 +8은 우편으로 보낼 수 없습니다.', status: 400 };

      const itemInfo = await tx.query<{ name: string }>('SELECT name FROM items WHERE id = $1', [slot.item_id]);
      itemName = itemInfo.rows[0]?.name || '';

      itemId = slot.item_id;
      itemQty = slot.quantity;
      enhLv = slot.enhance_level || 0;
      prefixIds = slot.prefix_ids;
      prefixStats = slot.prefix_stats;
      quality = slot.quality;

      await tx.query('DELETE FROM character_inventory WHERE id = $1', [slot.id]);
    }

    const subject = `${char.name}님의 선물`;
    const parts: string[] = [];
    if (itemName) parts.push(`아이템: ${itemName}`);
    if (gold > 0) parts.push(`골드: ${gold.toLocaleString()}G`);
    const body = parts.join(', ');

    await tx.query(
      `INSERT INTO mailbox (character_id, subject, body, item_id, item_quantity, gold,
                             enhance_level, prefix_ids, prefix_stats, quality, sender_character_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
      [
        recipient.id, subject, body,
        itemId > 0 ? itemId : null,
        itemQty > 0 ? itemQty : null,
        gold,
        enhLv || null,
        prefixIds && prefixIds.length > 0 ? prefixIds : null,
        prefixStats ? JSON.stringify(prefixStats) : null,
        quality || null,
        id,
      ]
    );

    return { ok: true };
  });

  if ('error' in result) return res.status(result.status).json({ error: result.error });
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
