import { Router, type Response } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { addItemToInventory } from '../game/inventory.js';
import { expToNext } from '../game/leveling.js';

const router = Router();
router.use(authRequired);

// ============================================================
// scope_key 계산: 구매 제한 범위별로 유니크한 키 생성
// ============================================================
async function currentScopeKey(scope: string | null): Promise<string> {
  if (!scope) return 'unlimited';
  switch (scope) {
    case 'daily': {
      const r = await query<{ d: string }>(`SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date::text AS d`);
      return `daily:${r.rows[0].d}`;
    }
    case 'weekly': {
      // ISO 주차 (KST 기준). YYYY-Www
      const r = await query<{ iso: string }>(
        `SELECT TO_CHAR(NOW() AT TIME ZONE 'Asia/Seoul', 'IYYY-"W"IW') AS iso`
      );
      return `weekly:${r.rows[0].iso}`;
    }
    case 'monthly': {
      const r = await query<{ m: string }>(
        `SELECT TO_CHAR(NOW() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS m`
      );
      return `monthly:${r.rows[0].m}`;
    }
    case 'account_total':
      return 'total';
    default:
      return 'unlimited';
  }
}

interface ShopItemRow {
  id: number;
  section: string;
  name: string;
  description: string;
  price: number;
  limit_scope: string | null;
  limit_count: number;
  reward_type: string;
  reward_payload: any;
  sort_order: number;
  leader_only: boolean;
  active: boolean;
}

// ============================================================
// GET /guild-boss-shop/:characterId/list
// 섹션별 전 상품 + 해당 캐릭의 남은 구매 가능 수 + 보유 메달
// ============================================================
router.get('/:characterId/list', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.characterId);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 보유 메달
  const medalsR = await query<{ guild_boss_medals: number }>(
    'SELECT guild_boss_medals FROM characters WHERE id = $1', [id]
  );
  const medals = medalsR.rows[0]?.guild_boss_medals ?? 0;

  // 길드장 여부 (leader_only 상품 노출 여부 판정)
  const leaderR = await query<{ is_leader: boolean }>(
    `SELECT (gm.role = 'leader') AS is_leader
     FROM guild_members gm WHERE gm.character_id = $1 LIMIT 1`, [id]
  );
  const isLeader = leaderR.rows[0]?.is_leader ?? false;

  // 상품 전체
  const itemsR = await query<ShopItemRow>(
    `SELECT id, section, name, description, price, limit_scope, limit_count,
            reward_type, reward_payload, sort_order, leader_only, active
     FROM guild_boss_shop_items
     WHERE active = TRUE
     ORDER BY
       CASE section WHEN 'large' THEN 0 WHEN 'medium' THEN 1 WHEN 'small' THEN 2 WHEN 'guild' THEN 3 ELSE 9 END,
       sort_order, id`
  );

  // 범위별 현재 스코프 키
  const scopeCache: Record<string, string> = {};
  async function getScopeKey(scope: string | null): Promise<string> {
    const k = scope ?? 'unlimited';
    if (scopeCache[k]) return scopeCache[k];
    scopeCache[k] = await currentScopeKey(scope);
    return scopeCache[k];
  }

  const out: any[] = [];
  for (const it of itemsR.rows) {
    const scopeKey = await getScopeKey(it.limit_scope);
    let purchased = 0;
    if (it.limit_count > 0) {
      if (it.limit_scope === 'account_total') {
        const r = await query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM guild_boss_shop_purchases p
           JOIN characters c ON c.id = p.character_id
           WHERE c.user_id = $1 AND p.shop_item_id = $2`,
          [req.userId, it.id]
        );
        purchased = Number(r.rows[0].c);
      } else {
        const r = await query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM guild_boss_shop_purchases
           WHERE character_id = $1 AND shop_item_id = $2 AND scope_key = $3`,
          [id, it.id, scopeKey]
        );
        purchased = Number(r.rows[0].c);
      }
    }
    const remaining = it.limit_count > 0 ? Math.max(0, it.limit_count - purchased) : -1;

    out.push({
      id: it.id,
      section: it.section,
      name: it.name,
      description: it.description,
      price: it.price,
      limitScope: it.limit_scope,
      limitCount: it.limit_count,
      purchased,
      remaining,  // -1 = 무제한
      leaderOnly: it.leader_only,
      canBuy: (!it.leader_only || isLeader) && (remaining !== 0) && medals >= it.price,
    });
  }

  res.json({ medals, isLeader, items: out });
});

// ============================================================
// POST /guild-boss-shop/:characterId/buy  body: { itemId }
// ============================================================
router.post('/:characterId/buy', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.characterId);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({ itemId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const itemId = parsed.data.itemId;

  // 상품 조회
  const itemR = await query<ShopItemRow>(
    `SELECT id, section, name, description, price, limit_scope, limit_count,
            reward_type, reward_payload, sort_order, leader_only, active
     FROM guild_boss_shop_items WHERE id = $1`, [itemId]
  );
  if (!itemR.rowCount) return res.status(404).json({ error: 'item not found' });
  const item = itemR.rows[0];
  if (!item.active) return res.status(400).json({ error: 'inactive' });

  // 길드장 여부 (leader_only 상품)
  if (item.leader_only) {
    const lr = await query<{ is_leader: boolean }>(
      `SELECT (gm.role = 'leader') AS is_leader
       FROM guild_members gm WHERE gm.character_id = $1 LIMIT 1`, [id]
    );
    if (!lr.rows[0]?.is_leader) return res.status(403).json({ error: 'leader only' });
  }

  // 구매 제한 체크
  const scopeKey = await currentScopeKey(item.limit_scope);
  if (item.limit_count > 0) {
    let purchased = 0;
    if (item.limit_scope === 'account_total') {
      const r = await query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM guild_boss_shop_purchases p
         JOIN characters c ON c.id = p.character_id
         WHERE c.user_id = $1 AND p.shop_item_id = $2`,
        [req.userId, item.id]
      );
      purchased = Number(r.rows[0].c);
    } else {
      const r = await query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM guild_boss_shop_purchases
         WHERE character_id = $1 AND shop_item_id = $2 AND scope_key = $3`,
        [id, item.id, scopeKey]
      );
      purchased = Number(r.rows[0].c);
    }
    if (purchased >= item.limit_count) return res.status(400).json({ error: 'limit reached' });
  }

  // 메달 차감 + 구매 기록 (원자적)
  try {
    await withTransaction(async (tx) => {
      const mr = await tx.query<{ guild_boss_medals: number }>(
        'SELECT guild_boss_medals FROM characters WHERE id = $1 FOR UPDATE', [id]
      );
      const curMedals = mr.rows[0]?.guild_boss_medals ?? 0;
      if (curMedals < item.price) throw new Error('not enough medals');

      await tx.query(
        'UPDATE characters SET guild_boss_medals = guild_boss_medals - $1 WHERE id = $2',
        [item.price, id]
      );
      await tx.query(
        `INSERT INTO guild_boss_shop_purchases (character_id, shop_item_id, scope_key)
         VALUES ($1, $2, $3)`,
        [id, item.id, scopeKey]
      );
    });
  } catch (e: any) {
    if (e.message === 'not enough medals') return res.status(400).json({ error: 'not enough medals' });
    throw e;
  }

  // 보상 지급 (트랜잭션 밖 — addItemToInventory 등 외부 함수 사용)
  const payload = item.reward_payload || {};
  const rewardNote: string[] = [];

  switch (item.reward_type) {
    case 'item': {
      const qty = Number(payload.qty) || 1;
      await addItemToInventory(id, Number(payload.itemId), qty).catch((e) => {
        console.error('[shop] addItemToInventory fail', e);
      });
      rewardNote.push(`아이템 ×${qty} 지급`);
      break;
    }
    case 'gold': {
      const amount = Number(payload.amount) || 0;
      await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [amount, id]);
      rewardNote.push(`골드 +${amount.toLocaleString()}`);
      break;
    }
    case 'storage_slot': {
      const amount = Number(payload.amount) || 0;
      const ur = await query<{ user_id: number }>('SELECT user_id FROM characters WHERE id = $1', [id]);
      if (ur.rowCount) {
        await query(
          'UPDATE users SET storage_slots_bonus = COALESCE(storage_slots_bonus, 0) + $1 WHERE id = $2',
          [amount, ur.rows[0].user_id]
        );
        rewardNote.push(`창고 슬롯 +${amount}`);
      }
      break;
    }
    case 'title_permanent': {
      await query('UPDATE characters SET title = $1 WHERE id = $2', [String(payload.title), id]);
      rewardNote.push(`호칭 "${payload.title}" 부여`);
      break;
    }
    case 'boosters_package': {
      const minutes = Number(payload.durationMin) || 60;
      const interval = `INTERVAL '${minutes} minutes'`;
      await query(
        `UPDATE characters SET
           exp_boost_until  = GREATEST(COALESCE(exp_boost_until, NOW()), NOW()) + ${interval},
           gold_boost_until = GREATEST(COALESCE(gold_boost_until, NOW()), NOW()) + ${interval},
           drop_boost_until = GREATEST(COALESCE(drop_boost_until, NOW()), NOW()) + ${interval},
           atk_boost_until  = GREATEST(COALESCE(atk_boost_until, NOW()), NOW()) + ${interval},
           hp_boost_until   = GREATEST(COALESCE(hp_boost_until, NOW()), NOW()) + ${interval}
         WHERE id = $1`,
        [id]
      );
      rewardNote.push(`부스터 5종 ${minutes}분`);
      break;
    }
    case 'exp_pct_of_level': {
      const pct = Number(payload.pct) || 1;
      const cr = await query<{ level: number; exp: string }>(
        'SELECT level, exp::text FROM characters WHERE id = $1', [id]
      );
      if (cr.rowCount) {
        const lv = cr.rows[0].level;
        const curExp = Number(cr.rows[0].exp);
        const reqExp = expToNext(lv);
        const gain = Math.floor(reqExp * (pct / 100));
        await query('UPDATE characters SET exp = $1 WHERE id = $2', [curExp + gain, id]);
        rewardNote.push(`EXP +${gain.toLocaleString()}`);
      }
      break;
    }
    case 'guild_exp': {
      const amount = Number(payload.amount) || 0;
      const gr = await query<{ guild_id: number | null }>(
        `SELECT guild_id FROM guild_members WHERE character_id = $1 LIMIT 1`, [id]
      );
      const gid = gr.rows[0]?.guild_id;
      if (gid) {
        await query('UPDATE guilds SET exp = exp + $1 WHERE id = $2', [amount, gid]);
        rewardNote.push(`길드 EXP +${amount}`);
      } else {
        rewardNote.push('길드 미가입 — 지급되지 않음');
      }
      break;
    }
    default:
      console.warn('[shop] unknown reward_type:', item.reward_type);
  }

  // 남은 메달
  const mr = await query<{ guild_boss_medals: number }>('SELECT guild_boss_medals FROM characters WHERE id = $1', [id]);
  const medalsLeft = mr.rows[0]?.guild_boss_medals ?? 0;

  res.json({
    ok: true,
    itemName: item.name,
    rewards: rewardNote,
    medalsLeft,
  });
});

export default router;
