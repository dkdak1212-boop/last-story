import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { addItemToInventory, deliverToMailbox } from '../game/inventory.js';

const router = Router();
router.use(authRequired);

const FEE_PCT = 0.10;
const AUCTION_HOURS = 24;

// 경매 목록 (필터)
router.get('/', async (req, res) => {
  const grade = req.query.grade as string | undefined;
  const type = req.query.type as string | undefined;

  const filters: string[] = ['a.settled = FALSE', 'a.cancelled = FALSE', 'a.ends_at > NOW()'];
  const params: unknown[] = [];
  if (grade) { params.push(grade); filters.push(`i.grade = $${params.length}`); }
  if (type)  { params.push(type);  filters.push(`i.type = $${params.length}`); }

  const r = await query<{
    id: number; item_id: number; item_quantity: number;
    start_price: string; buyout_price: string | null;
    current_bid: string | null; current_bidder_id: number | null;
    ends_at: string; seller_name: string;
    item_name: string; item_grade: string; item_type: string; item_slot: string | null;
    item_stats: Record<string, number> | null; item_description: string;
  }>(
    `SELECT a.id, a.item_id, a.item_quantity, a.start_price, a.buyout_price,
            a.current_bid, a.current_bidder_id, a.ends_at,
            c.name AS seller_name,
            i.name AS item_name, i.grade AS item_grade, i.type AS item_type, i.slot AS item_slot,
            i.stats AS item_stats, i.description AS item_description
     FROM auctions a JOIN characters c ON c.id = a.seller_id
                     JOIN items i ON i.id = a.item_id
     WHERE ${filters.join(' AND ')}
     ORDER BY a.ends_at ASC LIMIT 100`,
    params
  );
  res.json(r.rows.map(row => ({
    id: row.id, itemId: row.item_id, itemQuantity: row.item_quantity,
    startPrice: Number(row.start_price), buyoutPrice: row.buyout_price ? Number(row.buyout_price) : null,
    currentBid: row.current_bid ? Number(row.current_bid) : null,
    endsAt: row.ends_at, sellerName: row.seller_name,
    itemName: row.item_name, itemGrade: row.item_grade, itemType: row.item_type, itemSlot: row.item_slot,
    itemStats: row.item_stats, itemDescription: row.item_description,
  })));
});

// 아이템 등록 (인벤토리에서 제거)
router.post('/list', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    slotIndex: z.number().int().min(0),
    startPrice: z.number().int().positive(),
    buyoutPrice: z.number().int().positive().nullable().optional(),
    quantity: z.number().int().positive().max(99).default(1),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, slotIndex, startPrice, buyoutPrice, quantity } = parsed.data;

  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  if (buyoutPrice != null && buyoutPrice < startPrice) {
    return res.status(400).json({ error: 'buyout < start' });
  }

  const inv = await query<{ id: number; item_id: number; quantity: number }>(
    'SELECT id, item_id, quantity FROM character_inventory WHERE character_id = $1 AND slot_index = $2',
    [characterId, slotIndex]
  );
  if (inv.rowCount === 0) return res.status(404).json({ error: 'item not in slot' });
  if (inv.rows[0].quantity < quantity) return res.status(400).json({ error: 'insufficient quantity' });

  // 아이템 차감
  await query('UPDATE character_inventory SET quantity = quantity - $1 WHERE id = $2', [quantity, inv.rows[0].id]);
  await query('DELETE FROM character_inventory WHERE id = $1 AND quantity <= 0', [inv.rows[0].id]);

  const endsAt = new Date(Date.now() + AUCTION_HOURS * 3600 * 1000).toISOString();
  await query(
    `INSERT INTO auctions (seller_id, item_id, item_quantity, start_price, buyout_price, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [characterId, inv.rows[0].item_id, quantity, startPrice, buyoutPrice ?? null, endsAt]
  );
  res.json({ ok: true });
});

// 입찰
router.post('/:auctionId/bid', async (req: AuthedRequest, res: Response) => {
  const auctionId = Number(req.params.auctionId);
  const parsed = z.object({
    characterId: z.number().int().positive(),
    bid: z.number().int().positive(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, bid } = parsed.data;

  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const a = await query<{
    seller_id: number; start_price: string; current_bid: string | null; current_bidder_id: number | null;
    ends_at: string; settled: boolean; cancelled: boolean; buyout_price: string | null;
  }>(
    'SELECT seller_id, start_price, current_bid, current_bidder_id, ends_at, settled, cancelled, buyout_price FROM auctions WHERE id = $1',
    [auctionId]
  );
  if (a.rowCount === 0) return res.status(404).json({ error: 'auction not found' });
  const au = a.rows[0];
  if (au.settled || au.cancelled) return res.status(400).json({ error: 'auction closed' });
  if (new Date(au.ends_at) < new Date()) return res.status(400).json({ error: 'auction ended' });
  if (au.seller_id === characterId) return res.status(400).json({ error: 'cannot bid own' });

  const minBid = au.current_bid ? Number(au.current_bid) + 1 : Number(au.start_price);
  if (bid < minBid) return res.status(400).json({ error: `minimum bid ${minBid}` });
  if (char.gold < bid) return res.status(400).json({ error: 'not enough gold' });

  // 이전 입찰자 환불
  if (au.current_bidder_id && au.current_bid) {
    await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [au.current_bid, au.current_bidder_id]);
    await deliverToMailbox(au.current_bidder_id, '입찰 환불', '더 높은 입찰자가 나타나 환불되었습니다.', 0, 0);
  }
  // 현재 입찰자 골드 차감
  await query('UPDATE characters SET gold = gold - $1 WHERE id = $2', [bid, characterId]);
  await query(
    'UPDATE auctions SET current_bid = $1, current_bidder_id = $2 WHERE id = $3',
    [bid, characterId, auctionId]
  );
  res.json({ ok: true });
});

// 즉시 구매
router.post('/:auctionId/buyout', async (req: AuthedRequest, res: Response) => {
  const auctionId = Number(req.params.auctionId);
  const parsed = z.object({ characterId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const char = await loadCharacterOwned(parsed.data.characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const a = await query<{
    seller_id: number; buyout_price: string | null; item_id: number; item_quantity: number;
    current_bid: string | null; current_bidder_id: number | null;
    settled: boolean; cancelled: boolean; ends_at: string;
  }>(
    'SELECT seller_id, buyout_price, item_id, item_quantity, current_bid, current_bidder_id, settled, cancelled, ends_at FROM auctions WHERE id = $1',
    [auctionId]
  );
  if (a.rowCount === 0) return res.status(404).json({ error: 'auction not found' });
  const au = a.rows[0];
  if (au.settled || au.cancelled) return res.status(400).json({ error: 'auction closed' });
  if (new Date(au.ends_at) < new Date()) return res.status(400).json({ error: 'auction ended' });
  if (!au.buyout_price) return res.status(400).json({ error: 'no buyout' });
  if (au.seller_id === parsed.data.characterId) return res.status(400).json({ error: 'cannot buy own' });
  const price = Number(au.buyout_price);
  if (char.gold < price) return res.status(400).json({ error: 'not enough gold' });

  // 이전 입찰자 환불
  if (au.current_bidder_id && au.current_bid) {
    await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [au.current_bid, au.current_bidder_id]);
    await deliverToMailbox(au.current_bidder_id, '입찰 환불', '경매가 즉시구매로 종료되었습니다.', 0, 0);
  }

  // 결제 & 정산
  await query('UPDATE characters SET gold = gold - $1 WHERE id = $2', [price, parsed.data.characterId]);
  const sellerGet = Math.floor(price * (1 - FEE_PCT));
  await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [sellerGet, au.seller_id]);
  await deliverToMailbox(au.seller_id, '판매 정산', `수수료 ${Math.round(FEE_PCT*100)}% 차감 후 ${sellerGet}G 수령.`, 0, 0);
  // 아이템 지급
  const { overflow } = await addItemToInventory(parsed.data.characterId, au.item_id, au.item_quantity);
  if (overflow > 0) {
    await deliverToMailbox(parsed.data.characterId, '경매 낙찰 상품', '가방이 가득차서 우편함으로 배송', au.item_id, overflow);
  }
  await query('UPDATE auctions SET settled = TRUE WHERE id = $1', [auctionId]);
  res.json({ ok: true });
});

// 취소 (본인이 등록한 경매, 입찰 없을 때만)
router.post('/:auctionId/cancel', async (req: AuthedRequest, res: Response) => {
  const auctionId = Number(req.params.auctionId);
  const parsed = z.object({ characterId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const char = await loadCharacterOwned(parsed.data.characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const a = await query<{ seller_id: number; item_id: number; item_quantity: number; current_bid: string | null; settled: boolean; cancelled: boolean }>(
    'SELECT seller_id, item_id, item_quantity, current_bid, settled, cancelled FROM auctions WHERE id = $1', [auctionId]
  );
  if (a.rowCount === 0) return res.status(404).json({ error: 'not found' });
  if (a.rows[0].seller_id !== parsed.data.characterId) return res.status(403).json({ error: 'not owner' });
  if (a.rows[0].settled || a.rows[0].cancelled) return res.status(400).json({ error: 'already closed' });
  if (a.rows[0].current_bid) return res.status(400).json({ error: 'has bids' });

  await query('UPDATE auctions SET cancelled = TRUE WHERE id = $1', [auctionId]);
  await deliverToMailbox(parsed.data.characterId, '경매 취소 반환', '취소된 경매의 아이템을 돌려드립니다.', a.rows[0].item_id, a.rows[0].item_quantity);
  res.json({ ok: true });
});

// 내 경매 내역
router.get('/mine/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const r = await query<{
    id: number; item_id: number; item_quantity: number; start_price: string;
    buyout_price: string | null; current_bid: string | null; current_bidder_id: number | null;
    ends_at: string; settled: boolean; cancelled: boolean;
    item_name: string; item_grade: string;
  }>(
    `SELECT a.id, a.item_id, a.item_quantity, a.start_price, a.buyout_price,
            a.current_bid, a.current_bidder_id, a.ends_at, a.settled, a.cancelled,
            i.name AS item_name, i.grade AS item_grade
     FROM auctions a JOIN items i ON i.id = a.item_id
     WHERE a.seller_id = $1 ORDER BY a.created_at DESC LIMIT 50`,
    [cid]
  );
  res.json(r.rows.map(row => ({
    id: row.id, itemId: row.item_id, itemQuantity: row.item_quantity,
    startPrice: Number(row.start_price), buyoutPrice: row.buyout_price ? Number(row.buyout_price) : null,
    currentBid: row.current_bid ? Number(row.current_bid) : null,
    endsAt: row.ends_at, settled: row.settled, cancelled: row.cancelled,
    itemName: row.item_name, itemGrade: row.item_grade,
  })));
});

// 경매 만료 정산 (내부용)
export async function settleExpiredAuctions() {
  const r = await query<{ id: number; seller_id: number; item_id: number; item_quantity: number; current_bid: string | null; current_bidder_id: number | null }>(
    `SELECT id, seller_id, item_id, item_quantity, current_bid, current_bidder_id FROM auctions
     WHERE settled = FALSE AND cancelled = FALSE AND ends_at <= NOW()`
  );
  for (const a of r.rows) {
    if (a.current_bidder_id && a.current_bid) {
      // 낙찰
      const sellerGet = Math.floor(Number(a.current_bid) * (1 - FEE_PCT));
      await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [sellerGet, a.seller_id]);
      await deliverToMailbox(a.seller_id, '경매 낙찰 정산', `수수료 차감 후 ${sellerGet}G 수령`, 0, 0);
      await deliverToMailbox(a.current_bidder_id, '경매 낙찰 상품', '낙찰받은 아이템을 수령하세요.', a.item_id, a.item_quantity);
    } else {
      // 입찰 없음 → 반환
      await deliverToMailbox(a.seller_id, '경매 만료 반환', '낙찰자가 없어 아이템을 반환합니다.', a.item_id, a.item_quantity);
    }
    await query('UPDATE auctions SET settled = TRUE WHERE id = $1', [a.id]);
  }
}

export default router;
