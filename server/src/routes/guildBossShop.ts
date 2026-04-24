import { Router, type Response } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { addItemToInventory } from '../game/inventory.js';
import { expToNext } from '../game/leveling.js';
import { invalidateSessionMeta } from '../combat/engine.js';

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
  currency: string;
}

// ============================================================
// GET /guild-boss-shop/:characterId/list
// 섹션별 전 상품 + 해당 캐릭의 남은 구매 가능 수 + 보유 메달
// ============================================================
router.get('/:characterId/list', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.characterId);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 보유 개인 메달
  const medalsR = await query<{ guild_boss_medals: number }>(
    'SELECT guild_boss_medals FROM characters WHERE id = $1', [id]
  );
  const medals = medalsR.rows[0]?.guild_boss_medals ?? 0;

  // 길드 역할 + 길드 보유 메달 조회
  const roleR = await query<{ role: string | null; guild_id: number | null; guild_medals: string | null }>(
    `SELECT gm.role, gm.guild_id, g.guild_medals::text AS guild_medals
       FROM guild_members gm
       LEFT JOIN guilds g ON g.id = gm.guild_id
      WHERE gm.character_id = $1 LIMIT 1`, [id]
  );
  const role = roleR.rows[0]?.role ?? null;
  const isLeader = role === 'leader';
  const isOfficer = role === 'leader' || role === 'officer';
  const guildMedals = Number(roleR.rows[0]?.guild_medals ?? 0);

  // 상품 전체
  const itemsR = await query<ShopItemRow>(
    `SELECT id, section, name, description, price, limit_scope, limit_count,
            reward_type, reward_payload, sort_order, leader_only, active, currency
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

    // 길드 전용 화폐(guild_medal) 상품: role leader/officer 만, 길드 풀에서 차감
    // 그 외(medal) 상품: 기존 로직 (leader_only 있으면 leader 만, 개인 메달 차감)
    const isGuildMedal = it.currency === 'guild_medal';
    const authorized = isGuildMedal ? isOfficer : (!it.leader_only || isLeader);
    const balance = isGuildMedal ? guildMedals : medals;
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
      currency: it.currency,
      canBuy: authorized && (remaining !== 0) && balance >= it.price,
    });
  }

  res.json({ medals, guildMedals, isLeader, isOfficer, items: out });
});

// ============================================================
// POST /guild-boss-shop/:characterId/buy  body: { itemId }
// ============================================================
router.post('/:characterId/buy', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.characterId);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({
    itemId: z.number().int().positive(),
    option: z.string().max(20).optional(), // 택1 아이템용 (부스터 1시간 택1 등)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const itemId = parsed.data.itemId;
  const option = parsed.data.option;

  // 상품 조회
  const itemR = await query<ShopItemRow>(
    `SELECT id, section, name, description, price, limit_scope, limit_count,
            reward_type, reward_payload, sort_order, leader_only, active, currency
     FROM guild_boss_shop_items WHERE id = $1`, [itemId]
  );
  if (!itemR.rowCount) return res.status(404).json({ error: 'item not found' });
  const item = itemR.rows[0];
  if (!item.active) return res.status(400).json({ error: 'inactive' });

  const isGuildMedalItem = item.currency === 'guild_medal';

  // 길드 역할 확인 (guild_medal 상품은 leader/officer, medal+leader_only 는 leader 만)
  const roleR = await query<{ role: string | null; guild_id: number | null }>(
    `SELECT gm.role, gm.guild_id FROM guild_members gm WHERE gm.character_id = $1 LIMIT 1`, [id]
  );
  const role = roleR.rows[0]?.role ?? null;
  const guildId = roleR.rows[0]?.guild_id ?? null;

  if (isGuildMedalItem) {
    if (!guildId) return res.status(403).json({ error: '길드 미가입' });
    if (role !== 'leader' && role !== 'officer') {
      return res.status(403).json({ error: '길드 상점은 길드장/부길드장만 구매 가능합니다.' });
    }
  } else if (item.leader_only && role !== 'leader') {
    return res.status(403).json({ error: 'leader only' });
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
      if (isGuildMedalItem) {
        // 길드 풀에서 차감
        const gr = await tx.query<{ guild_medals: string }>(
          'SELECT guild_medals::text FROM guilds WHERE id = $1 FOR UPDATE', [guildId]
        );
        const curGm = Number(gr.rows[0]?.guild_medals ?? 0);
        if (curGm < item.price) throw new Error('not enough guild medals');
        await tx.query(
          'UPDATE guilds SET guild_medals = guild_medals - $1 WHERE id = $2',
          [item.price, guildId]
        );
      } else {
        const mr = await tx.query<{ guild_boss_medals: number }>(
          'SELECT guild_boss_medals FROM characters WHERE id = $1 FOR UPDATE', [id]
        );
        const curMedals = mr.rows[0]?.guild_boss_medals ?? 0;
        if (curMedals < item.price) throw new Error('not enough medals');
        await tx.query(
          'UPDATE characters SET guild_boss_medals = guild_boss_medals - $1 WHERE id = $2',
          [item.price, id]
        );
      }
      await tx.query(
        `INSERT INTO guild_boss_shop_purchases (character_id, shop_item_id, scope_key)
         VALUES ($1, $2, $3)`,
        [id, item.id, scopeKey]
      );
    });
  } catch (e: any) {
    if (e.message === 'not enough medals') return res.status(400).json({ error: '개인 메달이 부족합니다.' });
    if (e.message === 'not enough guild medals') return res.status(400).json({ error: '길드 메달이 부족합니다.' });
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
           drop_boost_until = GREATEST(COALESCE(drop_boost_until, NOW()), NOW()) + ${interval}
         WHERE id = $1`,
        [id]
      );
      invalidateSessionMeta(id);
      rewardNote.push(`부스터 3종 ${minutes}분`);
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
    case 'stat_permanent': {
      // 영구 스탯 묘약 세트: HP/ATK/MATK 각 +n (캡 초과 시 캡까지만)
      const hp = Number(payload.hp) || 0;
      const atk = Number(payload.atk) || 0;
      const matk = Number(payload.matk) || 0;
      const cap = Number(payload.cap) || 50;
      const cur = await query<{ permanent_stat_bonus_hp: number; permanent_stat_bonus_atk: number; permanent_stat_bonus_matk: number }>(
        `SELECT permanent_stat_bonus_hp, permanent_stat_bonus_atk, permanent_stat_bonus_matk FROM characters WHERE id = $1`, [id]
      );
      const curRow = cur.rows[0]!;
      const newHp = Math.min(cap, curRow.permanent_stat_bonus_hp + hp);
      const newAtk = Math.min(cap, curRow.permanent_stat_bonus_atk + atk);
      const newMatk = Math.min(cap, curRow.permanent_stat_bonus_matk + matk);
      await query(
        `UPDATE characters SET permanent_stat_bonus_hp = $1, permanent_stat_bonus_atk = $2, permanent_stat_bonus_matk = $3 WHERE id = $4`,
        [newHp, newAtk, newMatk, id]
      );
      const deltaHp = newHp - curRow.permanent_stat_bonus_hp;
      const deltaAtk = newAtk - curRow.permanent_stat_bonus_atk;
      const deltaMatk = newMatk - curRow.permanent_stat_bonus_matk;
      rewardNote.push(`영구 스탯 HP +${deltaHp} / ATK +${deltaAtk} / MATK +${deltaMatk}`);
      if (deltaHp === 0 && deltaAtk === 0 && deltaMatk === 0) {
        rewardNote.push(`(캡 ${cap} 도달)`);
      }
      break;
    }
    case 'booster_single': {
      // 부스터 1시간 택1 — option='exp'|'gold'|'drop'
      const minutes = Number(payload.durationMin) || 60;
      const interval = `INTERVAL '${minutes} minutes'`;
      const col = option === 'gold' ? 'gold_boost_until'
                : option === 'drop' ? 'drop_boost_until'
                : option === 'exp' ? 'exp_boost_until'
                : null;
      if (!col) {
        // option 누락 시 EXP 로 폴백 (UI 검증 실패 시 안전망)
        await query(
          `UPDATE characters SET exp_boost_until = GREATEST(COALESCE(exp_boost_until, NOW()), NOW()) + ${interval} WHERE id = $1`,
          [id]
        );
        rewardNote.push(`EXP +50% ${minutes}분 (option 누락 — 기본값)`);
      } else {
        await query(
          `UPDATE characters SET ${col} = GREATEST(COALESCE(${col}, NOW()), NOW()) + ${interval} WHERE id = $1`,
          [id]
        );
        const label = option === 'gold' ? '골드' : option === 'drop' ? '드랍' : 'EXP';
        rewardNote.push(`${label} +50% ${minutes}분`);
      }
      break;
    }
    case 'pvp_attack_bonus': {
      // 오늘 pvp_stats.daily_attacks -= amount (clamp 0)
      const amount = Number(payload.amount) || 1;
      const r = await query<{ daily_attacks: number }>('SELECT daily_attacks FROM pvp_stats WHERE character_id = $1', [id]);
      const cur = r.rows[0]?.daily_attacks ?? 0;
      const newVal = Math.max(0, cur - amount);
      await query('UPDATE pvp_stats SET daily_attacks = $1 WHERE character_id = $2', [newVal, id]);
      rewardNote.push(`PvP 공격 가능 횟수 +${cur - newVal}`);
      break;
    }
    case 'daily_quest_instant': {
      // 오늘 미완료 일일퀘 중 가장 오래된 1개 즉시 완료
      const todayR = await query<{ d: string }>(`SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date::text AS d`);
      const today = todayR.rows[0].d;
      const qr = await query<{ id: number; target_count: number }>(
        `SELECT id, target_count FROM character_daily_quests
         WHERE character_id = $1 AND assigned_date = $2 AND completed = FALSE
         ORDER BY id ASC LIMIT 1`,
        [id, today]
      );
      if (!qr.rowCount) {
        rewardNote.push('오늘 미완료 일일임무 없음 — 메달은 소모됨');
      } else {
        await query(
          `UPDATE character_daily_quests SET progress = target_count, completed = TRUE WHERE id = $1`,
          [qr.rows[0].id]
        );
        rewardNote.push('일일임무 1개 즉시 완료');
      }
      break;
    }
    case 'guild_buff_24h_all': {
      // 소속 길드의 exp/gold/drop_boost_until 을 +24시간 연장 (+25% 효과는 적용 측에서 읽음)
      const hours = Number(payload.durationHours) || 24;
      const interval = `INTERVAL '${hours} hours'`;
      const gr = await query<{ guild_id: number | null }>(
        `SELECT guild_id FROM guild_members WHERE character_id = $1 LIMIT 1`, [id]
      );
      const gid = gr.rows[0]?.guild_id;
      if (gid) {
        await query(
          `UPDATE guilds SET
             exp_boost_until  = GREATEST(COALESCE(exp_boost_until, NOW()), NOW()) + ${interval},
             gold_boost_until = GREATEST(COALESCE(gold_boost_until, NOW()), NOW()) + ${interval},
             drop_boost_until = GREATEST(COALESCE(drop_boost_until, NOW()), NOW()) + ${interval}
           WHERE id = $1`, [gid]
        );
        rewardNote.push(`길드 EXP/골드/드랍 +25% ${hours}시간`);
      } else {
        rewardNote.push('길드 미가입 — 지급되지 않음');
      }
      break;
    }
    // 'guild_storage_slot' 상품 제거됨 (2026-04-24)
    default:
      console.warn('[shop] unknown reward_type:', item.reward_type);
  }

  // 남은 메달 (개인 + 길드)
  const mr = await query<{ guild_boss_medals: number }>('SELECT guild_boss_medals FROM characters WHERE id = $1', [id]);
  const medalsLeft = mr.rows[0]?.guild_boss_medals ?? 0;
  let guildMedalsLeft = 0;
  if (guildId) {
    const gr = await query<{ guild_medals: string }>('SELECT guild_medals::text FROM guilds WHERE id = $1', [guildId]);
    guildMedalsLeft = Number(gr.rows[0]?.guild_medals ?? 0);
  }

  res.json({
    ok: true,
    itemName: item.name,
    rewards: rewardNote,
    medalsLeft,
    guildMedalsLeft,
    currency: item.currency,
  });
});

export default router;
