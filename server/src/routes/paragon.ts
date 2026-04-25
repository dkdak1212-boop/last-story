// 차원의 정수 (Paragon) — Lv.100 전용 endgame 노드 트리
//   - EXP 250억 = 1 paragon_point 구매
//   - paragon_points 는 zone='paragon' 노드 투자에 사용 (일반 node_points 와 분리)
//   - 키스톤 (tier='huge', zone='paragon') 캐릭당 최대 2개 투자
//   - 리셋 시 paragon_points 보존 (재배치 자유)
import { Router, type Response } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { refreshSessionStats } from '../combat/engine.js';

const router = Router();
router.use(authRequired);

export const PARAGON_EXP_PER_POINT = 25_000_000_000n; // 250억
export const KEYSTONE_CAP = 2;

// GET /paragon/:characterId/state — 보유 포인트, 키스톤 활성 수, 변환 가능 여부
router.get('/:characterId/state', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const r = await query<{ exp: string; paragon_points: number; level: number }>(
    'SELECT exp::text, COALESCE(paragon_points, 0) AS paragon_points, level FROM characters WHERE id = $1',
    [cid]
  );
  const row = r.rows[0];
  const exp = BigInt(row.exp);

  // 키스톤 활성 수
  const ksR = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM character_nodes cn JOIN node_definitions nd ON nd.id = cn.node_id
      WHERE cn.character_id = $1 AND nd.zone = 'paragon' AND nd.tier = 'huge'`,
    [cid]
  );

  res.json({
    paragonPoints: row.paragon_points,
    keystonesActive: ksR.rows[0]?.n ?? 0,
    keystonesCap: KEYSTONE_CAP,
    eligible: row.level >= 100,
    expCurrent: row.exp,
    expPerPoint: PARAGON_EXP_PER_POINT.toString(),
    pointsAvailable: Number(exp / PARAGON_EXP_PER_POINT),
  });
});

// POST /paragon/:characterId/buy { amount }
//   - amount 만큼 paragon_points 구매 (각 250억 EXP 차감)
//   - 원자적 UPDATE — exp 부족 / Lv.<100 시 거부
router.post('/:characterId/buy', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  if (char.level < 100) return res.status(400).json({ error: 'Lv.100 도달 후 구매 가능' });

  const parsed = z.object({ amount: z.number().int().positive().max(1000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid amount' });
  const amount = parsed.data.amount;
  const expCost = PARAGON_EXP_PER_POINT * BigInt(amount);

  // 원자적 차감: exp 충분할 때만 성공
  const r = await query<{ exp: string; paragon_points: number }>(
    `UPDATE characters
        SET exp = exp - $1::bigint,
            paragon_points = COALESCE(paragon_points, 0) + $2
      WHERE id = $3 AND exp >= $1::bigint
     RETURNING exp::text, paragon_points`,
    [expCost.toString(), amount, cid]
  );
  if (r.rowCount === 0) return res.status(400).json({ error: 'EXP 부족' });

  res.json({ ok: true, paragonPoints: r.rows[0].paragon_points, expRemaining: r.rows[0].exp });
});

// POST /paragon/:characterId/reset
//   - paragon zone 노드 모두 해제 (character_nodes 에서 zone='paragon' 노드 삭제)
//   - paragon_points 는 보존 (재배치 자유)
//   - 일반 node_points 는 영향 없음
router.post('/:characterId/reset', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 전투 중이면 차단 — 패시브 변경 시 상태 오염 위험
  try {
    const { activeSessions } = await import('../combat/engine.js');
    if (activeSessions.has(cid)) return res.status(400).json({ error: '전투 중에는 리셋 불가. 마을 귀환 후 시도.' });
  } catch {}

  await withTransaction(async (tx) => {
    // 캐릭 행 락
    await tx.query('SELECT id FROM characters WHERE id = $1 FOR UPDATE', [cid]);
    await tx.query(
      `DELETE FROM character_nodes
        WHERE character_id = $1
          AND node_id IN (SELECT id FROM node_definitions WHERE zone = 'paragon')`,
      [cid]
    );
  });
  await refreshSessionStats(cid).catch(() => {});

  res.json({ ok: true });
});

export default router;
