import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';

const router = Router();
router.use(authRequired);

// 노드 트리 전체 조회 + 캐릭터 투자 현황
router.get('/:id/nodes', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const nodesR = await query<{
    id: number; name: string; description: string; zone: string; tier: string;
    cost: number; class_exclusive: string | null; effects: any; prerequisites: number[];
    position_x: number; position_y: number;
  }>(
    `SELECT id, name, description, zone, tier, cost, class_exclusive, effects,
            prerequisites, position_x, position_y
     FROM node_definitions
     WHERE class_exclusive IS NULL OR class_exclusive = $1
     ORDER BY zone, tier, id`,
    [char.class_name]
  );

  const investedR = await query<{ node_id: number }>(
    'SELECT node_id FROM character_nodes WHERE character_id = $1',
    [id]
  );
  const investedIds = investedR.rows.map(r => r.node_id);

  res.json({
    availablePoints: char.node_points,
    totalPoints: (char.level - 1) * 2,
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

// 노드 투자
const investSchema = z.object({ nodeId: z.number().int().positive() });

router.post('/:id/nodes/invest', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = investSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { nodeId } = parsed.data;

  // 노드 존재 체크
  const nodeR = await query<{ cost: number; class_exclusive: string | null; prerequisites: number[] }>(
    'SELECT cost, class_exclusive, prerequisites FROM node_definitions WHERE id = $1', [nodeId]
  );
  if (nodeR.rowCount === 0) return res.status(404).json({ error: 'node not found' });
  const node = nodeR.rows[0];

  // 직업 제한
  if (node.class_exclusive && node.class_exclusive !== char.class_name) {
    return res.status(400).json({ error: 'class restriction' });
  }

  // 포인트 부족
  if (char.node_points < node.cost) {
    return res.status(400).json({ error: 'not enough points' });
  }

  // 이미 투자
  const dup = await query('SELECT 1 FROM character_nodes WHERE character_id=$1 AND node_id=$2', [id, nodeId]);
  if (dup.rowCount && dup.rowCount > 0) return res.status(400).json({ error: 'already invested' });

  // 선행 노드 체크
  if (node.prerequisites && node.prerequisites.length > 0) {
    const prereqR = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM character_nodes
       WHERE character_id = $1 AND node_id = ANY($2::int[])`,
      [id, node.prerequisites]
    );
    if (Number(prereqR.rows[0].cnt) < node.prerequisites.length) {
      return res.status(400).json({ error: 'prerequisites not met' });
    }
  }

  await query('INSERT INTO character_nodes (character_id, node_id) VALUES ($1, $2)', [id, nodeId]);
  await query('UPDATE characters SET node_points = node_points - $1 WHERE id = $2', [node.cost, id]);

  res.json({ ok: true, remainingPoints: char.node_points - node.cost });
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

  res.json({ ok: true, refundedPoints: refund, goldSpent: cost });
});

// 구역 리셋
router.post('/:id/nodes/reset-zone', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const { zone } = req.body;
  if (!zone) return res.status(400).json({ error: 'zone required' });

  const cost = 2000;
  if (char.gold < cost) return res.status(400).json({ error: 'not enough gold' });

  const zoneNodes = await query<{ node_id: number; cost: number }>(
    `SELECT cn.node_id, nd.cost FROM character_nodes cn
     JOIN node_definitions nd ON nd.id = cn.node_id
     WHERE cn.character_id = $1 AND nd.zone = $2`,
    [id, zone]
  );

  if (zoneNodes.rowCount === 0) return res.status(400).json({ error: 'no nodes in zone' });

  let refund = 0;
  const nodeIds: number[] = [];
  for (const row of zoneNodes.rows) {
    refund += row.cost;
    nodeIds.push(row.node_id);
  }

  await query('DELETE FROM character_nodes WHERE character_id = $1 AND node_id = ANY($2::int[])', [id, nodeIds]);
  await query('UPDATE characters SET node_points = node_points + $1, gold = gold - $2 WHERE id = $3',
    [refund, cost, id]);

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

  res.json({ ok: true, refundedPoints: refund, goldSpent: cost });
});

export default router;
