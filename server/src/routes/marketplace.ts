import { Router, type Response } from 'express';
import { z } from 'zod';
import { query, withTransaction, type TxOk, type TxErr } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { deliverToMailbox } from '../game/inventory.js';
import { displayPrefixStats } from '../game/prefix.js';
import { getClientIp, getLatestCharacterOwnerIp, sameIpBlocked } from '../middleware/antifraud.js';

const router = Router();
router.use(authRequired);

const FEE_PCT = 0.10;
const LISTING_HOURS = 72; // 거래소 등록 기간 3일
const MAX_LISTINGS_PER_ACCOUNT = 30; // 계정(seller_id 기준 캐릭) 동시 활성 등록 한도

// 거래소 목록
router.get('/', async (req, res) => {
  const slot = req.query.slot as string | undefined; // 카테고리 필터 (weapon/helm/chest/boots/ring/amulet)
  const grade = req.query.grade as string | undefined; // 등급 필터 (common/rare/epic/legendary/unique)
  const qualityMin = req.query.qualityMin ? Number(req.query.qualityMin) : null;
  const qualityMax = req.query.qualityMax ? Number(req.query.qualityMax) : null;
  const prefixStatKey = req.query.prefixStatKey as string | undefined; // ex: atk, dot_amp_pct ...
  const prefixTier = req.query.prefixTier ? Number(req.query.prefixTier) : null; // 1~4
  const levelBracket = req.query.levelBracket as string | undefined; // '' | '1-9' | '10-19' | ... | '70+'

  const filters: string[] = ['a.settled = FALSE', 'a.cancelled = FALSE', 'a.ends_at > NOW()', 'a.listed_at <= NOW()'];
  const params: unknown[] = [];
  if (slot) { params.push(slot); filters.push(`i.slot = $${params.length}`); }
  if (grade) { params.push(grade); filters.push(`i.grade = $${params.length}`); }
  if (qualityMin !== null && Number.isFinite(qualityMin)) {
    params.push(Math.max(0, Math.min(100, qualityMin)));
    filters.push(`COALESCE(a.quality, 0) >= $${params.length}`);
  }
  if (qualityMax !== null && Number.isFinite(qualityMax)) {
    params.push(Math.max(0, Math.min(100, qualityMax)));
    filters.push(`COALESCE(a.quality, 0) <= $${params.length}`);
  }
  if (prefixStatKey) {
    params.push(prefixStatKey);
    filters.push(`a.prefix_stats ? $${params.length}`);
  }
  if (prefixTier !== null && Number.isFinite(prefixTier) && prefixTier >= 1 && prefixTier <= 4) {
    params.push(prefixTier);
    filters.push(`EXISTS (SELECT 1 FROM item_prefixes p WHERE p.id = ANY(a.prefix_ids) AND p.tier = $${params.length})`);
  }
  // 레벨 구간 필터 (서버사이드) — egress 절감
  if (levelBracket) {
    if (levelBracket === '100+') {
      filters.push(`COALESCE(i.required_level, 1) >= 100`);
    } else {
      const match = /^(\d+)-(\d+)$/.exec(levelBracket);
      if (match) {
        const lo = Number(match[1]);
        const hi = Number(match[2]);
        params.push(lo); const loIdx = params.length;
        params.push(hi); const hiIdx = params.length;
        filters.push(`COALESCE(i.required_level, 1) BETWEEN $${loIdx} AND $${hiIdx}`);
      }
    }
  }

  const r = await query<{
    id: number; item_id: number; item_quantity: number;
    buyout_price: string | null;
    ends_at: string;
    item_name: string; item_grade: string; item_type: string; item_slot: string | null;
    item_stats: Record<string, number> | null; item_description: string;
    enhance_level: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null;
    quality: number; class_restriction: string | null; required_level: number;
  }>(
    `SELECT a.id, a.item_id, a.item_quantity, a.buyout_price, a.ends_at,
            a.enhance_level, a.prefix_ids, a.prefix_stats, COALESCE(a.quality, 0) AS quality,
            i.name AS item_name, i.grade AS item_grade, i.type AS item_type, i.slot AS item_slot,
            i.stats AS item_stats, i.description AS item_description, i.class_restriction,
            COALESCE(i.required_level, 1) AS required_level
     FROM auctions a JOIN items i ON i.id = a.item_id
     WHERE ${filters.join(' AND ')}
     ORDER BY a.created_at DESC LIMIT 300`,
    params
  );

  // 접두사 이름 매핑 (모든 prefix_id 한꺼번에 조회)
  const allPrefixIds = [...new Set(r.rows.flatMap(row => row.prefix_ids || []))];
  const prefixInfoMap = new Map<number, { name: string; tier: number; statKey: string }>();
  if (allPrefixIds.length > 0) {
    const pr = await query<{ id: number; name: string; tier: number; stat_key: string }>(
      'SELECT id, name, tier, stat_key FROM item_prefixes WHERE id = ANY($1::int[])', [allPrefixIds]
    );
    for (const p of pr.rows) prefixInfoMap.set(p.id, { name: p.name, tier: p.tier, statKey: p.stat_key });
  }
  function buildPrefixName(ids: number[] | null): string {
    if (!ids || ids.length === 0) return '';
    return ids.map(id => prefixInfoMap.get(id)?.name).filter(Boolean).join(' ');
  }
  function buildPrefixTiers(ids: number[] | null): Record<string, number> {
    const result: Record<string, number> = {};
    if (!ids) return result;
    for (const id of ids) {
      const info = prefixInfoMap.get(id);
      if (!info) continue;
      if (!result[info.statKey] || result[info.statKey] < info.tier) {
        result[info.statKey] = info.tier;
      }
    }
    return result;
  }

  res.json(r.rows.map(row => {
    const prefixName = buildPrefixName(row.prefix_ids);
    return {
      id: row.id, itemId: row.item_id, itemQuantity: row.item_quantity,
      price: row.buyout_price ? Number(row.buyout_price) : 0,
      endsAt: row.ends_at,
      itemName: prefixName ? `${prefixName} ${row.item_name}` : row.item_name,
      baseItemName: row.item_name,
      prefixName,
      itemGrade: row.item_grade, itemType: row.item_type, itemSlot: row.item_slot,
      itemStats: row.item_stats, // 강화 안 된 raw stats
      itemDescription: row.item_description,
      enhanceLevel: row.enhance_level || 0,
      prefixStats: displayPrefixStats(row.prefix_stats, row.enhance_level || 0),
      prefixTiers: buildPrefixTiers(row.prefix_ids),
      quality: row.quality || 0,
      classRestriction: row.class_restriction,
      requiredLevel: row.required_level || 1,
    };
  }));
});

// 아이템 등록 (즉시 구매가만)
router.post('/list', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    slotIndex: z.number().int().min(0),
    price: z.number().int().positive(),
    quantity: z.number().int().positive().max(99).default(1),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, slotIndex, price, quantity } = parsed.data;

  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const result = await withTransaction<TxOk | TxErr>(async (tx) => {
    const cntR = await tx.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM auctions a
       JOIN characters c ON c.id = a.seller_id
       WHERE c.user_id = $1 AND a.settled = FALSE AND a.cancelled = FALSE AND a.ends_at > NOW()`,
      [req.userId]
    );
    const activeCnt = Number(cntR.rows[0].cnt);
    if (activeCnt >= MAX_LISTINGS_PER_ACCOUNT) {
      return { error: `계정당 동시 등록은 ${MAX_LISTINGS_PER_ACCOUNT}개까지 가능합니다. (현재 ${activeCnt}개 활성)`, status: 400 };
    }

    const inv = await tx.query<{ id: number; item_id: number; quantity: number; enhance_level: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; quality: number; soulbound: boolean; unidentified: boolean; item_slot: string | null }>(
      `SELECT ci.id, ci.item_id, ci.quantity, ci.enhance_level, ci.prefix_ids, ci.prefix_stats,
              COALESCE(ci.quality, 0) AS quality, COALESCE(ci.soulbound, FALSE) AS soulbound,
              COALESCE(ci.unidentified, FALSE) AS unidentified,
              i.slot AS item_slot
       FROM character_inventory ci JOIN items i ON i.id = ci.item_id
       WHERE ci.character_id = $1 AND ci.slot_index = $2 FOR UPDATE`,
      [characterId, slotIndex]
    );
    if (inv.rowCount === 0) return { error: 'item not in slot', status: 404 };
    if (inv.rows[0].quantity < quantity) return { error: 'insufficient quantity', status: 400 };
    if (inv.rows[0].soulbound) return { error: '착용한 적이 있는 장비는 거래소에 등록할 수 없습니다. (계정 귀속)', status: 400 };
    if (!inv.rows[0].item_slot) return { error: '장비만 거래소에 등록할 수 있습니다.', status: 400 };

    const invRow = inv.rows[0];

    await tx.query('UPDATE character_inventory SET quantity = quantity - $1 WHERE id = $2', [quantity, invRow.id]);
    await tx.query('DELETE FROM character_inventory WHERE id = $1 AND quantity <= 0', [invRow.id]);

    // 어뷰 방지: 등록 시 1~15분 랜덤 딜레이 후 노출 (판매자에게 정확한 시간 미노출)
    const delayMinutes = 1 + Math.floor(Math.random() * 15);
    const listedAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
    const endsAt = new Date(Date.now() + LISTING_HOURS * 3600 * 1000 + delayMinutes * 60_000).toISOString();
    await tx.query(
      `INSERT INTO auctions (seller_id, item_id, item_quantity, start_price, buyout_price, ends_at, enhance_level, prefix_ids, prefix_stats, quality, listed_at, unidentified)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)`,
      [characterId, invRow.item_id, quantity, price, endsAt,
       invRow.enhance_level || 0,
       invRow.prefix_ids || null,
       invRow.prefix_stats ? JSON.stringify(invRow.prefix_stats) : null,
       invRow.quality || 0,
       listedAt,
       invRow.unidentified]
    );
    return { ok: true };
  });

  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

// 구매 → 우편으로 지급
router.post('/:auctionId/buyout', async (req: AuthedRequest, res: Response) => {
  const auctionId = Number(req.params.auctionId);
  const parsed = z.object({ characterId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const char = await loadCharacterOwned(parsed.data.characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 판매자 캐릭터 먼저 조회 → 계정/IP 체크 (트랜잭션 밖에서 빠르게)
  const sellerLookup = await query<{ seller_id: number; seller_user_id: number | null }>(
    `SELECT a.seller_id, c.user_id AS seller_user_id
     FROM auctions a LEFT JOIN characters c ON c.id = a.seller_id
     WHERE a.id = $1`,
    [auctionId]
  );
  if (sellerLookup.rowCount === 0) return res.status(404).json({ error: 'item not found' });
  const sellerRow = sellerLookup.rows[0];
  if (sellerRow.seller_user_id === req.userId) {
    return res.status(400).json({ error: '본인 계정의 아이템은 살 수 없습니다.' });
  }
  {
    const myIp = getClientIp(req);
    const sellerIp = await getLatestCharacterOwnerIp(sellerRow.seller_id);
    if (sameIpBlocked(myIp, sellerIp)) {
      return res.status(400).json({ error: '같은 IP의 판매자 아이템은 구매할 수 없습니다.' });
    }
  }

  const result = await withTransaction<TxOk | TxErr>(async (tx) => {
    const a = await tx.query<{
      seller_id: number; buyout_price: string | null; item_id: number; item_quantity: number;
      settled: boolean; cancelled: boolean; ends_at: string; listed_at: string;
      enhance_level: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; quality: number;
      unidentified: boolean;
    }>(
      `SELECT seller_id, buyout_price, item_id, item_quantity, settled, cancelled, ends_at, listed_at,
              enhance_level, prefix_ids, prefix_stats, COALESCE(quality, 0) AS quality,
              COALESCE(unidentified, FALSE) AS unidentified
       FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId]
    );
    if (a.rowCount === 0) return { error: 'item not found', status: 404 };
    const au = a.rows[0];
    if (au.settled || au.cancelled) return { error: '판매 종료됨', status: 400 };
    if (new Date(au.listed_at) > new Date()) return { error: '아직 노출 대기 중인 매물입니다.', status: 400 };
    if (new Date(au.ends_at) < new Date()) return { error: '등록 만료', status: 400 };
    if (!au.buyout_price) return { error: 'no price', status: 400 };
    if (au.seller_id === parsed.data.characterId) return { error: '본인 아이템은 살 수 없습니다', status: 400 };
    const price = Number(au.buyout_price);

    const goldR = await tx.query<{ gold: number }>(
      'SELECT gold FROM characters WHERE id = $1 FOR UPDATE', [parsed.data.characterId]
    );
    if (goldR.rows[0].gold < price) return { error: '골드 부족', status: 400 };

    await tx.query('UPDATE auctions SET settled = TRUE WHERE id = $1', [auctionId]);
    await tx.query('UPDATE characters SET gold = gold - $1 WHERE id = $2', [price, parsed.data.characterId]);

    const itemMeta = await tx.query<{ name: string; grade: string }>(
      'SELECT name, grade FROM items WHERE id = $1', [au.item_id]
    );
    const metaRow = itemMeta.rows[0];
    const prefixNames = au.prefix_ids && au.prefix_ids.length > 0
      ? (await tx.query<{ name: string }>(`SELECT name FROM item_prefixes WHERE id = ANY($1::int[])`, [au.prefix_ids])).rows.map(r => r.name).join(' ')
      : '';
    const fullName = [
      prefixNames,
      metaRow?.name || '아이템',
    ].filter(Boolean).join(' ') + (au.enhance_level > 0 ? ` +${au.enhance_level}` : '');
    const qtyStr = au.item_quantity > 1 ? ` x${au.item_quantity}` : '';

    const sellerGet = Math.floor(price * (1 - FEE_PCT));
    await tx.query(
      `INSERT INTO mailbox (character_id, subject, body, gold)
       VALUES ($1, $2, $3, $4)`,
      [au.seller_id, `판매 완료: ${fullName}${qtyStr}`,
       `[${fullName}${qtyStr}] 판매 완료\n판매가 ${price.toLocaleString()}G · 수수료 ${Math.round(FEE_PCT*100)}%\n수령 ${sellerGet.toLocaleString()}G`,
       sellerGet]
    );

    let enhLv = au.enhance_level || 0;
    let pIds: number[] = au.prefix_ids || [];
    let pStats = au.prefix_stats ? JSON.stringify(au.prefix_stats) : '{}';
    let qual = au.quality || 0;

    // ── 미확인 아이템: 구매 시 옵션 굴림 (3옵 보장 + 시공균열 unique 고정 옵션 병합) ──
    if (au.unidentified) {
      const { generateGuaranteed3Prefixes } = await import('../game/prefix.js');
      // 시공균열 세트는 itemLevel ≥ 100 (110 제). required_level 조회.
      const lvR = await tx.query<{ required_level: number; unique_prefix_stats: Record<string, number> | null }>(
        `SELECT COALESCE(required_level, 100) AS required_level, unique_prefix_stats FROM items WHERE id = $1`,
        [au.item_id]
      );
      const itemLv = lvR.rows[0]?.required_level ?? 100;
      const uniqStats = lvR.rows[0]?.unique_prefix_stats || null;
      const rolled = await generateGuaranteed3Prefixes(itemLv);
      pIds = rolled.prefixIds;
      const merged: Record<string, number> = uniqStats ? { ...uniqStats } : {};
      for (const [k, v] of Object.entries(rolled.bonusStats)) {
        merged[k] = (merged[k] || 0) + (v as number);
      }
      pStats = JSON.stringify(merged);
      qual = Math.floor(Math.random() * 100) + 1;     // 1~100 보장
      enhLv = 0;
    }

    const usedR = await tx.query<{ slot_index: number }>(
      'SELECT slot_index FROM character_inventory WHERE character_id = $1', [parsed.data.characterId]
    );
    const usedSlots = new Set(usedR.rows.map(r => r.slot_index));
    let freeSlot = -1;
    for (let i = 0; i < 300; i++) if (!usedSlots.has(i)) { freeSlot = i; break; }

    if (freeSlot >= 0) {
      await tx.query(
        `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, enhance_level, prefix_ids, prefix_stats, quality)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [parsed.data.characterId, au.item_id, freeSlot, au.item_quantity, enhLv, pIds, pStats, qual]
      );
    } else {
      await tx.query(
        `INSERT INTO mailbox (character_id, subject, body, item_id, item_quantity, enhance_level, prefix_ids, prefix_stats, quality)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [parsed.data.characterId, '거래소 구매', '가방이 가득 차서 우편 발송',
         au.item_id, au.item_quantity, enhLv, pIds.length > 0 ? pIds : null, au.prefix_stats ? JSON.stringify(au.prefix_stats) : null, qual]
      );
    }

    return { ok: true };
  });

  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

// 등록 취소
router.post('/:auctionId/cancel', async (req: AuthedRequest, res: Response) => {
  const auctionId = Number(req.params.auctionId);
  const parsed = z.object({ characterId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const char = await loadCharacterOwned(parsed.data.characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const result = await withTransaction<TxOk | TxErr>(async (tx) => {
    const a = await tx.query<{
      seller_id: number; item_id: number; item_quantity: number;
      settled: boolean; cancelled: boolean;
      enhance_level: number; prefix_ids: number[] | null;
      prefix_stats: Record<string, number> | null; quality: number;
    }>(
      `SELECT seller_id, item_id, item_quantity, settled, cancelled,
              enhance_level, prefix_ids, prefix_stats, COALESCE(quality, 0) AS quality
       FROM auctions WHERE id = $1 FOR UPDATE`, [auctionId]
    );
    if (a.rowCount === 0) return { error: 'not found', status: 404 };
    const ar = a.rows[0];
    if (ar.seller_id !== parsed.data.characterId) return { error: 'not owner', status: 403 };
    if (ar.settled || ar.cancelled) return { error: 'already closed', status: 400 };

    await tx.query('UPDATE auctions SET cancelled = TRUE WHERE id = $1', [auctionId]);
    await tx.query(
      `INSERT INTO mailbox (character_id, subject, body, item_id, item_quantity, gold,
                             enhance_level, prefix_ids, prefix_stats, quality)
       VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8::jsonb, $9)`,
      [parsed.data.characterId, '거래소 등록 취소', '취소된 아이템을 돌려드립니다.',
       ar.item_id, ar.item_quantity,
       ar.enhance_level || 0,
       ar.prefix_ids && ar.prefix_ids.length > 0 ? ar.prefix_ids : null,
       ar.prefix_stats ? JSON.stringify(ar.prefix_stats) : null,
       ar.quality || 0]
    );
    return { ok: true };
  });

  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

// 계정 등록 한도 현황 (인벤 등록 모달용)
router.get('/listings-quota', async (req: AuthedRequest, res: Response) => {
  const r = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM auctions a
     JOIN characters c ON c.id = a.seller_id
     WHERE c.user_id = $1 AND a.settled = FALSE AND a.cancelled = FALSE AND a.ends_at > NOW()`,
    [req.userId]
  );
  res.json({ active: Number(r.rows[0].cnt), max: MAX_LISTINGS_PER_ACCOUNT });
});

// 내 등록 목록
router.get('/mine/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const r = await query<{
    id: number; item_id: number; item_quantity: number;
    buyout_price: string | null;
    ends_at: string; settled: boolean; cancelled: boolean;
    item_name: string; item_grade: string;
  }>(
    `SELECT a.id, a.item_id, a.item_quantity, a.buyout_price, a.ends_at, a.settled, a.cancelled,
            i.name AS item_name, i.grade AS item_grade
     FROM auctions a JOIN items i ON i.id = a.item_id
     WHERE a.seller_id = $1 ORDER BY a.created_at DESC LIMIT 50`,
    [cid]
  );
  res.json(r.rows.map(row => ({
    id: row.id, itemId: row.item_id, itemQuantity: row.item_quantity,
    price: row.buyout_price ? Number(row.buyout_price) : 0,
    endsAt: row.ends_at, settled: row.settled, cancelled: row.cancelled,
    itemName: row.item_name, itemGrade: row.item_grade,
  })));
});

// 만료 정산 — 미판매 아이템 반환 (옵션 보존)
export async function settleExpiredAuctions() {
  const r = await query<{
    id: number; seller_id: number; item_id: number; item_quantity: number;
    enhance_level: number; prefix_ids: number[] | null;
    prefix_stats: Record<string, number> | null; quality: number;
  }>(
    `SELECT id, seller_id, item_id, item_quantity,
            enhance_level, prefix_ids, prefix_stats, COALESCE(quality, 0) AS quality
     FROM auctions
     WHERE settled = FALSE AND cancelled = FALSE AND ends_at <= NOW()`
  );
  for (const a of r.rows) {
    await deliverToMailbox(
      a.seller_id, '거래소 만료 반환', '판매되지 않은 아이템을 반환합니다.',
      a.item_id, a.item_quantity, 0,
      {
        enhanceLevel: a.enhance_level || 0,
        prefixIds: a.prefix_ids || null,
        prefixStats: a.prefix_stats || null,
        quality: a.quality || 0,
      }
    );
    await query('UPDATE auctions SET settled = TRUE WHERE id = $1', [a.id]);
  }
}

export default router;
