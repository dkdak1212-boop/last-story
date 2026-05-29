// 포인트 상점 — 만렙 후 EXP→포인트 전환 + 낡은 망토 접두사 굴림 + 포인트→골드 환전
// spec: last-story-weekend-update-spec.md §3·§4
//  - 전환: 1,000만 EXP = 1 포인트 (Lv.100 한정, exp 직접 차감 → EMA 미경유)
//  - 굴림: 1회 1,000 포인트, 낡은 망토 한정, 티어 T1 95/T2 4/T3 0.9/T4 0.1, levelScale 1.5 고정, 최대 3슬롯
//  - 환전: 1 포인트 = 10만 골드
import { Router, type Response } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { generateSinglePrefixOfTier } from '../game/prefix.js';
import { refreshSessionStats } from '../combat/engine.js';

const router = Router();
router.use(authRequired);

const EXP_PER_POINT = 10_000_000;   // 1,000만 EXP = 1 P
const GOLD_PER_POINT = 100_000;     // 1 P = 10만 골드
const ROLL_COST = 1000;             // 굴림 1회 = 1,000 P
const CLOAK_LEVEL_SCALE = 1.5;      // 낡은 망토 고정 스케일
const MAX_CLOAK_SLOTS = 3;

// 낡은 망토 굴림 전용 티어 분포 (T1 95 / T2 4 / T3 0.9 / T4 0.1)
function rollCloakTier(): number {
  const r = Math.random() * 100;
  if (r < 0.1) return 4;
  if (r < 1.0) return 3;   // 0.1 ~ 1.0 → 0.9%
  if (r < 5.0) return 2;   // 1.0 ~ 5.0 → 4%
  return 1;                // 95%
}

interface PrefixMeta { id: number; name: string; tier: number; stat_key: string; }

async function loadPrefixMetas(ids: number[]): Promise<Map<number, PrefixMeta>> {
  const m = new Map<number, PrefixMeta>();
  if (!ids.length) return m;
  const r = await query<PrefixMeta>(
    `SELECT id, name, tier, stat_key FROM item_prefixes WHERE id = ANY($1)`, [ids]
  );
  for (const row of r.rows) m.set(row.id, row);
  return m;
}

// 망토 현재 접두사 슬롯 구성 반환
async function readCloak(characterId: number): Promise<{
  prefixIds: number[];
  prefixStats: Record<string, number>;
  slots: { index: number; prefixId: number; name: string; tier: number; statKey: string; value: number }[];
} | null> {
  const r = await query<{ prefix_ids: number[] | null; prefix_stats: Record<string, number> | null }>(
    `SELECT prefix_ids, prefix_stats FROM character_equipped WHERE character_id = $1 AND slot = 'cloak'`,
    [characterId]
  );
  if (!r.rowCount) return null;
  const prefixIds = r.rows[0].prefix_ids || [];
  const prefixStats = r.rows[0].prefix_stats || {};
  const metas = await loadPrefixMetas(prefixIds);
  const slots = prefixIds.map((pid, index) => {
    const meta = metas.get(pid);
    const statKey = meta?.stat_key ?? '';
    return {
      index, prefixId: pid,
      name: meta?.name ?? '?',
      tier: meta?.tier ?? 1,
      statKey,
      value: statKey ? (prefixStats[statKey] ?? 0) : 0,
    };
  });
  return { prefixIds, prefixStats, slots };
}

// ============================================================
// GET /point-shop/:characterId/info
// ============================================================
router.get('/:characterId/info', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.characterId);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const cr = await query<{ points: string; exp: string; level: number; gold: string }>(
    `SELECT points::text, exp::text, level, gold::text FROM characters WHERE id = $1`, [id]
  );
  const row = cr.rows[0];
  const points = Number(row.points || 0);
  const exp = Number(row.exp || 0);
  const level = row.level;
  const cloak = await readCloak(id);

  res.json({
    points,
    exp,
    level,
    gold: Number(row.gold || 0),
    convertibleExp: level >= 100 ? exp : 0,
    convertiblePoints: level >= 100 ? Math.floor(exp / EXP_PER_POINT) : 0,
    rates: { expPerPoint: EXP_PER_POINT, goldPerPoint: GOLD_PER_POINT, rollCost: ROLL_COST },
    maxSlots: MAX_CLOAK_SLOTS,
    cloak: cloak ? cloak.slots : [],
  });
});

// ============================================================
// POST /point-shop/:characterId/convert  { points: N }
// 만렙 후 누적 EXP → 포인트 (1,000만 EXP = 1 P)
// ============================================================
router.post('/:characterId/convert', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.characterId);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({ points: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '전환할 포인트 수량이 올바르지 않습니다.' });
  const gainPoints = parsed.data.points;
  const expCost = gainPoints * EXP_PER_POINT;

  // exp 직접 차감 — 배치/EMA 경로 미경유 (online_exp_rate 폭발 버그 회피). 상대 차감이라 flush 와 호환.
  const r = await query(
    `UPDATE characters SET exp = exp - $1, points = points + $2
       WHERE id = $3 AND level >= 100 AND exp >= $1
     RETURNING points::text AS points, exp::text AS exp`,
    [expCost, gainPoints, id]
  );
  if (!r.rowCount) {
    return res.status(400).json({ error: '만렙(100) 이후 누적 EXP가 부족합니다.' });
  }
  res.json({
    ok: true,
    gainedPoints: gainPoints,
    spentExp: expCost,
    points: Number(r.rows[0].points),
    exp: Number(r.rows[0].exp),
  });
});

// ============================================================
// POST /point-shop/:characterId/buy-gold  { points: N }
// 포인트 → 골드 (1 P = 10만 골드)
// ============================================================
router.post('/:characterId/buy-gold', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.characterId);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({ points: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '환전할 포인트 수량이 올바르지 않습니다.' });
  const spend = parsed.data.points;

  const r = await query(
    `UPDATE characters SET points = points - $1, gold = gold + $2
       WHERE id = $3 AND points >= $1
     RETURNING points::text AS points, gold::text AS gold`,
    [spend, spend * GOLD_PER_POINT, id]
  );
  if (!r.rowCount) return res.status(400).json({ error: '포인트가 부족합니다.' });
  res.json({
    ok: true,
    spentPoints: spend,
    gainedGold: spend * GOLD_PER_POINT,
    points: Number(r.rows[0].points),
    gold: Number(r.rows[0].gold),
  });
});

// ============================================================
// POST /point-shop/:characterId/roll-cloak  { slotIndex?: 0~2 }
// 낡은 망토 접두사 굴림 (1,000 P). 3슬롯 미만이면 추가, 꽉 차면 slotIndex 교체.
// ============================================================
router.post('/:characterId/roll-cloak', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.characterId);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({ slotIndex: z.number().int().min(0).max(MAX_CLOAK_SLOTS - 1).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '입력이 올바르지 않습니다.' });
  const slotIndex = parsed.data.slotIndex;

  let result: { statKey: string; value: number; tier: number; name: string; replacedSlot: number | null } | null = null;

  try {
    await withTransaction(async (tx) => {
      // 1) 포인트 차감 (잠금)
      const pr = await tx.query<{ points: string }>(
        `SELECT points::text FROM characters WHERE id = $1 FOR UPDATE`, [id]
      );
      const cur = Number(pr.rows[0]?.points ?? 0);
      if (cur < ROLL_COST) throw new Error('not enough points');
      await tx.query(`UPDATE characters SET points = points - $1 WHERE id = $2`, [ROLL_COST, id]);

      // 2) 망토 현재 접두사 (잠금)
      const cr = await tx.query<{ prefix_ids: number[] | null; prefix_stats: Record<string, number> | null }>(
        `SELECT prefix_ids, prefix_stats FROM character_equipped WHERE character_id = $1 AND slot = 'cloak' FOR UPDATE`,
        [id]
      );
      if (!cr.rowCount) throw new Error('no cloak');
      const prefixIds = (cr.rows[0].prefix_ids || []).slice();
      const prefixStats = { ...(cr.rows[0].prefix_stats || {}) };

      const tier = rollCloakTier();
      let replacedSlot: number | null = null;

      if (prefixIds.length < MAX_CLOAK_SLOTS) {
        // 새 슬롯 추가 — 기존 stat_key 중복 회피
        const exclude = new Set(Object.keys(prefixStats));
        const roll = await generateSinglePrefixOfTier(1, tier, exclude, CLOAK_LEVEL_SCALE);
        if (!roll) throw new Error('roll failed');
        prefixIds.push(roll.prefixId);
        prefixStats[roll.statKey] = roll.value;
        result = { statKey: roll.statKey, value: roll.value, tier, name: '', replacedSlot: null };
      } else {
        // 꽉 참 — slotIndex 지정 필수, 그 자리만 재굴림 (나머지 2개 stat_key 회피)
        if (slotIndex === undefined || slotIndex >= prefixIds.length) {
          throw new Error('slot required');
        }
        const oldMetas = await loadPrefixMetasTx(tx, prefixIds);
        const oldStatKey = oldMetas.get(prefixIds[slotIndex])?.stat_key;
        const exclude = new Set<string>();
        for (let i = 0; i < prefixIds.length; i++) {
          if (i === slotIndex) continue;
          const sk = oldMetas.get(prefixIds[i])?.stat_key;
          if (sk) exclude.add(sk);
        }
        const roll = await generateSinglePrefixOfTier(1, tier, exclude, CLOAK_LEVEL_SCALE);
        if (!roll) throw new Error('roll failed');
        if (oldStatKey && oldStatKey !== roll.statKey) delete prefixStats[oldStatKey];
        prefixIds[slotIndex] = roll.prefixId;
        prefixStats[roll.statKey] = roll.value;
        replacedSlot = slotIndex;
        result = { statKey: roll.statKey, value: roll.value, tier, name: '', replacedSlot };
      }

      await tx.query(
        `UPDATE character_equipped SET prefix_ids = $1, prefix_stats = $2::jsonb
           WHERE character_id = $3 AND slot = 'cloak'`,
        [prefixIds, JSON.stringify(prefixStats), id]
      );
    });
  } catch (e: any) {
    if (e.message === 'not enough points') return res.status(400).json({ error: '포인트가 부족합니다.' });
    if (e.message === 'slot required') return res.status(400).json({ error: '접두사가 3개 꽉 찼습니다. 교체할 슬롯을 선택하세요.' });
    if (e.message === 'no cloak') return res.status(400).json({ error: '낡은 망토를 찾을 수 없습니다.' });
    console.error('[point-shop/roll-cloak] err', e);
    return res.status(500).json({ error: '굴림 실패' });
  }

  // 전투 세션 활성 시 equipPrefixes 즉시 반영
  try { await refreshSessionStats(id); } catch { /* 세션 없음 */ }

  const cloak = await readCloak(id);
  const pr2 = await query<{ points: string }>(`SELECT points::text FROM characters WHERE id = $1`, [id]);
  res.json({
    ok: true,
    roll: result,
    points: Number(pr2.rows[0]?.points ?? 0),
    cloak: cloak ? cloak.slots : [],
  });
});

// 트랜잭션 클라이언트용 prefix 메타 로드
async function loadPrefixMetasTx(tx: any, ids: number[]): Promise<Map<number, PrefixMeta>> {
  const m = new Map<number, PrefixMeta>();
  if (!ids.length) return m;
  const r = await tx.query(
    `SELECT id, name, tier, stat_key FROM item_prefixes WHERE id = ANY($1)`, [ids]
  );
  for (const row of r.rows) m.set(row.id, row);
  return m;
}

export default router;
