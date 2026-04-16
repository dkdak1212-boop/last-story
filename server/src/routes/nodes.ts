import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { refreshSessionStats } from '../combat/engine.js';

const router = Router();
router.use(authRequired);

// 노드 트리 전체 조회 + 캐릭터 투자 현황
router.get('/:id/nodes', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const adminR = await query<{ is_admin: boolean }>(
    'SELECT COALESCE(is_admin, FALSE) AS is_admin FROM users WHERE id = $1', [req.userId]
  );
  const isAdmin = adminR.rows[0]?.is_admin ?? false;

  const nodesR = await query<{
    id: number; name: string; description: string; zone: string; tier: string;
    cost: number; class_exclusive: string | null; effects: any; prerequisites: number[];
    position_x: number; position_y: number; hidden: boolean;
  }>(
    `SELECT id, name, description, zone, tier, cost, class_exclusive, effects,
            prerequisites, position_x, position_y, COALESCE(hidden, FALSE) AS hidden
     FROM node_definitions
     WHERE ((class_exclusive = $1)
        OR (class_exclusive IS NULL AND NOT ($1 = 'summoner' AND zone = 'core')))
       AND (COALESCE(hidden, FALSE) = FALSE OR $2 = TRUE)
     ORDER BY zone, tier, id`,
    [char.class_name, isAdmin]
  );

  const investedR = await query<{ node_id: number }>(
    'SELECT node_id FROM character_nodes WHERE character_id = $1',
    [id]
  );
  const investedIds = investedR.rows.map(r => r.node_id);

  res.json({
    availablePoints: char.node_points,
    totalPoints: char.level - 1,
    investedNodeIds: investedIds,
    nodes: nodesR.rows.map(n => ({
      id: n.id,
      name: n.name,
      description: n.description,
      zone: n.zone,
      tier: n.tier,
      cost: n.cost,
      classExclusive: n.class_exclusive,
      effects: n.effects,
      prerequisites: n.prerequisites || [],
      positionX: n.position_x,
      positionY: n.position_y,
    })),
  });
});

// 노드 투자 (4포인트 노드: 하위노드 일괄 습득)
const investSchema = z.object({ nodeId: z.number().int().positive() });

router.post('/:id/nodes/invest', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = investSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { nodeId } = parsed.data;

  // 노드 존재 체크
  const nodeR = await query<{ cost: number; class_exclusive: string | null; prerequisites: number[]; tier: string; hidden: boolean }>(
    'SELECT cost, class_exclusive, prerequisites, tier, COALESCE(hidden, FALSE) AS hidden FROM node_definitions WHERE id = $1', [nodeId]
  );
  if (nodeR.rowCount === 0) return res.status(404).json({ error: 'node not found' });
  const node = nodeR.rows[0];

  // hidden 노드는 어드민만 투자 가능
  if (node.hidden) {
    const admR = await query<{ is_admin: boolean }>('SELECT COALESCE(is_admin, FALSE) AS is_admin FROM users WHERE id = $1', [req.userId]);
    if (!admR.rows[0]?.is_admin) return res.status(403).json({ error: 'admin only' });
  }

  // 직업 제한
  if (node.class_exclusive && node.class_exclusive !== char.class_name) {
    return res.status(400).json({ error: 'class restriction' });
  }

  // 초월(huge) 노드 개수 제한 제거 — 포인트만 있으면 여러 개 학습 가능

  // 이미 투자
  const dup = await query('SELECT 1 FROM character_nodes WHERE character_id=$1 AND node_id=$2', [id, nodeId]);
  if (dup.rowCount && dup.rowCount > 0) return res.status(400).json({ error: 'already invested' });

  // 4포인트 노드: 경로상 미습득 선행 노드 자동 습득
  const investedR = await query<{ node_id: number }>(
    'SELECT node_id FROM character_nodes WHERE character_id = $1', [id]
  );
  const investedSet = new Set(investedR.rows.map(r => r.node_id));

  // 재귀적으로 미습득 선행 노드 수집
  async function collectUnmetPrereqs(nid: number, collected: Map<number, number>): Promise<void> {
    if (collected.has(nid) || investedSet.has(nid)) return;
    const nr = await query<{ cost: number; prerequisites: number[]; class_exclusive: string | null }>(
      'SELECT cost, prerequisites, class_exclusive FROM node_definitions WHERE id = $1', [nid]
    );
    if (nr.rowCount === 0) return;
    const n = nr.rows[0];
    if (n.class_exclusive && n.class_exclusive !== char!.class_name) return;
    // 먼저 하위 선행 노드 수집
    if (n.prerequisites && n.prerequisites.length > 0) {
      for (const pid of n.prerequisites) {
        await collectUnmetPrereqs(pid, collected);
      }
    }
    if (!investedSet.has(nid)) {
      collected.set(nid, n.cost);
    }
  }

  // 모든 노드: 미습득 선행 노드 자동 습득
  const toInvest = new Map<number, number>();
  if (node.prerequisites && node.prerequisites.length > 0) {
    for (const pid of node.prerequisites) {
      await collectUnmetPrereqs(pid, toInvest);
    }
  }
  toInvest.set(nodeId, node.cost);

  const totalCost = Array.from(toInvest.values()).reduce((a, b) => a + b, 0);
  if (char.node_points < totalCost) {
    return res.status(400).json({ error: `포인트 부족 (필요: ${totalCost}, 보유: ${char.node_points})` });
  }

  for (const [nid] of toInvest) {
    await query('INSERT INTO character_nodes (character_id, node_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, nid]);
  }
  await query('UPDATE characters SET node_points = node_points - $1 WHERE id = $2', [totalCost, id]);

  // 전투 중 노드 투자 시 인메모리 세션 갱신 (패시브/스탯 즉시 반영)
  await refreshSessionStats(id).catch(() => {});

  res.json({ ok: true, remainingPoints: char.node_points - totalCost, invested: toInvest.size });
});

// 부분 리셋 (마지막 5포인트)
router.post('/:id/nodes/reset-partial', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const cost = 500;
  if (char.gold < cost) return res.status(400).json({ error: 'not enough gold' });

  // 마지막 투자 5포인트 환불
  const lastNodes = await query<{ node_id: number; cost: number }>(
    `SELECT cn.node_id, nd.cost FROM character_nodes cn
     JOIN node_definitions nd ON nd.id = cn.node_id
     WHERE cn.character_id = $1
     ORDER BY cn.invested_at DESC LIMIT 5`,
    [id]
  );

  if (lastNodes.rowCount === 0) return res.status(400).json({ error: 'no nodes to reset' });

  let refund = 0;
  const nodeIds: number[] = [];
  for (const row of lastNodes.rows) {
    refund += row.cost;
    nodeIds.push(row.node_id);
  }

  await query('DELETE FROM character_nodes WHERE character_id = $1 AND node_id = ANY($2::int[])', [id, nodeIds]);
  await query('UPDATE characters SET node_points = node_points + $1, gold = gold - $2 WHERE id = $3',
    [refund, cost, id]);
  await refreshSessionStats(id).catch(() => {});

  res.json({ ok: true, refundedPoints: refund, goldSpent: cost });
});

// 전체 리셋
router.post('/:id/nodes/reset-all', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const cost = 5000;
  if (char.gold < cost) return res.status(400).json({ error: 'not enough gold' });

  const totalR = await query<{ total: string }>(
    `SELECT COALESCE(SUM(nd.cost), 0)::text AS total FROM character_nodes cn
     JOIN node_definitions nd ON nd.id = cn.node_id
     WHERE cn.character_id = $1`,
    [id]
  );
  const refund = Number(totalR.rows[0].total);

  await query('DELETE FROM character_nodes WHERE character_id = $1', [id]);
  await query('UPDATE characters SET node_points = node_points + $1, gold = gold - $2 WHERE id = $3',
    [refund, cost, id]);
  await refreshSessionStats(id).catch(() => {});

  res.json({ ok: true, refundedPoints: refund, goldSpent: cost });
});

export default router;
