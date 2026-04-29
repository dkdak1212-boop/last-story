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
  // 전투 중 노드 변경 차단 — 패시브/버프 상태 오염 방지
  try {
    const { activeSessions } = await import('../combat/engine.js');
    if (activeSessions.has(id)) return res.status(400).json({ error: '전투 중에는 노드를 변경할 수 없습니다. 마을로 귀환 후 시도해주세요.' });
  } catch {}

  const parsed = investSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { nodeId } = parsed.data;

  // 노드 존재 체크
  const nodeR = await query<{ cost: number; class_exclusive: string | null; prerequisites: number[]; tier: string; hidden: boolean; effects: any; zone: string }>(
    'SELECT cost, class_exclusive, prerequisites, tier, COALESCE(hidden, FALSE) AS hidden, effects, zone FROM node_definitions WHERE id = $1', [nodeId]
  );
  if (nodeR.rowCount === 0) return res.status(404).json({ error: 'node not found' });
  const node = nodeR.rows[0];

  // 차원의 정수 (paragon) 노드 — Lv.100 + 키스톤 cap 2 + paragon_points 사용 (일반 오픈)
  const isParagon = node.zone === 'paragon';
  if (isParagon) {
    if (char.level < 100) return res.status(400).json({ error: 'Lv.100 도달 후 투자 가능' });
    if (node.tier === 'huge') {
      // 키스톤 cap (huge tier 만 카운트)
      const ksR = await query<{ n: number }>(
        `SELECT COUNT(*)::int AS n
           FROM character_nodes cn JOIN node_definitions nd ON nd.id = cn.node_id
          WHERE cn.character_id = $1 AND nd.zone = 'paragon' AND nd.tier = 'huge'`,
        [id]
      );
      if ((ksR.rows[0]?.n ?? 0) >= 2) {
        return res.status(400).json({ error: '키스톤은 캐릭당 최대 2개만 투자 가능' });
      }
    }
  }

  // hidden 노드는 어드민만 투자 가능
  if (node.hidden) {
    const admR = await query<{ is_admin: boolean }>('SELECT COALESCE(is_admin, FALSE) AS is_admin FROM users WHERE id = $1', [req.userId]);
    if (!admR.rows[0]?.is_admin) return res.status(403).json({ error: 'admin only' });
  }

  // 직업 제한
  if (node.class_exclusive && node.class_exclusive !== char.class_name) {
    return res.status(400).json({ error: 'class restriction' });
  }

  // 계단식 선택형 (tier_group) 체크
  const tierGroupEff = Array.isArray(node.effects) ? node.effects.find((e: any) => e.type === 'tier_group') : null;
  if (tierGroupEff) {
    const tierNum = tierGroupEff.value as number;
    // 같은 층에 이미 선택한 노드가 있는지 확인
    const sameTierNodes = await query<{ id: number }>(
      `SELECT nd.id FROM node_definitions nd
       JOIN character_nodes cn ON cn.node_id = nd.id AND cn.character_id = $1
       WHERE nd.zone = $2 AND nd.class_exclusive = $3
         AND nd.effects @> $4::jsonb`,
      [id, node.zone, node.class_exclusive, JSON.stringify([{ type: 'tier_group', value: tierNum }])]
    );
    if (sameTierNodes.rowCount && sameTierNodes.rowCount > 0) {
      return res.status(400).json({ error: `${tierNum}층은 이미 선택 완료` });
    }
    // 이전 층이 선택되어 있는지 확인 (1층은 무조건 가능)
    if (tierNum > 1) {
      const prevTierNodes = await query<{ id: number }>(
        `SELECT nd.id FROM node_definitions nd
         JOIN character_nodes cn ON cn.node_id = nd.id AND cn.character_id = $1
         WHERE nd.zone = $2 AND nd.class_exclusive = $3
           AND nd.effects @> $4::jsonb`,
        [id, node.zone, node.class_exclusive, JSON.stringify([{ type: 'tier_group', value: tierNum - 1 }])]
      );
      if (!prevTierNodes.rowCount || prevTierNodes.rowCount === 0) {
        return res.status(400).json({ error: `${tierNum - 1}층을 먼저 선택하세요` });
      }
    }
  }

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
  // paragon 노드: paragon_points 풀 사용. 일반 노드: node_points 풀.
  if (isParagon) {
    const ppR = await query<{ paragon_points: number }>('SELECT COALESCE(paragon_points, 0) AS paragon_points FROM characters WHERE id = $1', [id]);
    const pp = ppR.rows[0]?.paragon_points ?? 0;
    if (pp < totalCost) {
      return res.status(400).json({ error: `paragon 포인트 부족 (필요: ${totalCost}, 보유: ${pp}). EXP 250억 = 1pt 구매 가능.` });
    }
    for (const [nid] of toInvest) {
      await query('INSERT INTO character_nodes (character_id, node_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, nid]);
    }
    await query('UPDATE characters SET paragon_points = paragon_points - $1 WHERE id = $2', [totalCost, id]);
  } else {
    if (char.node_points < totalCost) {
      return res.status(400).json({ error: `포인트 부족 (필요: ${totalCost}, 보유: ${char.node_points})` });
    }
    for (const [nid] of toInvest) {
      await query('INSERT INTO character_nodes (character_id, node_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, nid]);
    }
    await query('UPDATE characters SET node_points = node_points - $1 WHERE id = $2', [totalCost, id]);
  }

  // 전투 중 노드 투자 시 인메모리 세션 갱신 (패시브/스탯 즉시 반영)
  await refreshSessionStats(id).catch(() => {});

  res.json({ ok: true, remainingPoints: char.node_points - totalCost, invested: toInvest.size });
});

// 전체 리셋
router.post('/:id/nodes/reset-all', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  try {
    const { activeSessions } = await import('../combat/engine.js');
    if (activeSessions.has(id)) return res.status(400).json({ error: '전투 중에는 노드를 리셋할 수 없습니다. 마을로 귀환 후 시도해주세요.' });
  } catch {}

  const cost = 5000;
  if (char.gold < cost) return res.status(400).json({ error: 'not enough gold' });

  // paragon zone 노드는 paragon_points 로, 나머지는 node_points 로 분리 환불.
  // 이전 통합 환불은 paragon 노드 cost 도 node_points 로 잘못 가산해 paragon_points 가
  // 사라지는 버그가 있었음 (두둥게 보고).
  const totalR = await query<{ paragon_total: string; normal_total: string }>(
    `SELECT
        COALESCE(SUM(CASE WHEN nd.zone = 'paragon' THEN nd.cost ELSE 0 END), 0)::text AS paragon_total,
        COALESCE(SUM(CASE WHEN nd.zone = 'paragon' THEN 0 ELSE nd.cost END), 0)::text AS normal_total
       FROM character_nodes cn
       JOIN node_definitions nd ON nd.id = cn.node_id
      WHERE cn.character_id = $1`,
    [id]
  );
  const paragonRefund = Number(totalR.rows[0].paragon_total);
  const normalRefund = Number(totalR.rows[0].normal_total);

  await query('DELETE FROM character_nodes WHERE character_id = $1', [id]);
  await query(
    `UPDATE characters
        SET node_points = node_points + $1,
            paragon_points = COALESCE(paragon_points, 0) + $2,
            gold = gold - $3
      WHERE id = $4`,
    [normalRefund, paragonRefund, cost, id]
  );
  await refreshSessionStats(id).catch(() => {});

  res.json({
    ok: true,
    refundedPoints: normalRefund,
    refundedParagonPoints: paragonRefund,
    goldSpent: cost,
  });
});

// ═══ 노드 프리셋 ═══

// 목록 조회
router.get('/:id/node-presets', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const r = await query<{ preset_idx: number; name: string; node_ids: number[] }>(
    'SELECT preset_idx, name, node_ids FROM character_node_presets WHERE character_id = $1 ORDER BY preset_idx', [id]
  );
  const map = new Map(r.rows.map(row => [row.preset_idx, row]));
  const presets = [1, 2, 3].map(idx => {
    const p = map.get(idx);
    return { idx, name: p?.name || `프리셋 ${idx}`, nodeIds: p?.node_ids || [], empty: !p };
  });
  res.json(presets);
});

// 현재 노드 → 프리셋 저장
router.post('/:id/node-presets/:idx/save', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const idx = Number(req.params.idx);
  if (idx < 1 || idx > 3) return res.status(400).json({ error: 'invalid preset index' });
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const nr = await query<{ node_id: number }>('SELECT node_id FROM character_nodes WHERE character_id = $1', [id]);
  const nodeIds = nr.rows.map(r => r.node_id);

  await query(
    `INSERT INTO character_node_presets (character_id, preset_idx, node_ids)
     VALUES ($1, $2, $3)
     ON CONFLICT (character_id, preset_idx) DO UPDATE SET node_ids = $3`,
    [id, idx, nodeIds]
  );
  res.json({ ok: true, count: nodeIds.length });
});

// 프리셋 → 노드 로드 (전체 리셋 후 재투자)
router.post('/:id/node-presets/:idx/load', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const idx = Number(req.params.idx);
  if (idx < 1 || idx > 3) return res.status(400).json({ error: 'invalid preset index' });
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  try {
    const { activeSessions } = await import('../combat/engine.js');
    if (activeSessions.has(id)) return res.status(400).json({ error: '전투 중에는 노드 프리셋을 변경할 수 없습니다. 마을로 귀환 후 시도해주세요.' });
  } catch {}

  const pr = await query<{ node_ids: number[] }>(
    'SELECT node_ids FROM character_node_presets WHERE character_id = $1 AND preset_idx = $2', [id, idx]
  );
  if (pr.rowCount === 0 || pr.rows[0].node_ids.length === 0) return res.status(404).json({ error: '저장된 프리셋이 없습니다' });
  const targetNodeIds = pr.rows[0].node_ids;

  // 프리셋에 차원의 정수(paragon) 노드 포함 시 별도 검증 — 일반 오픈 후 제한 없음.
  // (paragon 노드 자체의 Lv.100 / 키스톤 cap / paragon_points 부족은 invest 단계에서 처리됨)

  // 현재 노드 전체 환불
  const totalR = await query<{ total: string }>(
    `SELECT COALESCE(SUM(nd.cost), 0)::text AS total FROM character_nodes cn
     JOIN node_definitions nd ON nd.id = cn.node_id WHERE cn.character_id = $1`, [id]
  );
  const refund = Number(totalR.rows[0].total);
  await query('DELETE FROM character_nodes WHERE character_id = $1', [id]);
  await query('UPDATE characters SET node_points = node_points + $1 WHERE id = $2', [refund, id]);

  // 프리셋 노드 투자 (존재하는 노드만, 포인트 충분한 만큼)
  const charR = await query<{ node_points: number }>('SELECT node_points FROM characters WHERE id = $1', [id]);
  let points = charR.rows[0].node_points;
  let invested = 0;

  // 노드를 cost 순으로 정렬해서 선행 노드부터 투자
  const nodeDefsR = await query<{ id: number; cost: number }>(
    'SELECT id, cost FROM node_definitions WHERE id = ANY($1::int[])', [targetNodeIds]
  );
  const nodeCostMap = new Map(nodeDefsR.rows.map(r => [r.id, r.cost]));

  for (const nid of targetNodeIds) {
    const cost = nodeCostMap.get(nid);
    if (!cost || points < cost) continue;
    await query('INSERT INTO character_nodes (character_id, node_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, nid]);
    points -= cost;
    invested++;
  }
  await query('UPDATE characters SET node_points = $1 WHERE id = $2', [points, id]);
  await refreshSessionStats(id).catch(() => {});

  res.json({ ok: true, invested, remainingPoints: points });
});

// 프리셋 이름 변경
router.post('/:id/node-presets/:idx/rename', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const idx = Number(req.params.idx);
  const parsed = z.object({ name: z.string().max(20) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  await query(
    `INSERT INTO character_node_presets (character_id, preset_idx, name, node_ids)
     VALUES ($1, $2, $3, '{}')
     ON CONFLICT (character_id, preset_idx) DO UPDATE SET name = $3`,
    [id, idx, parsed.data.name]
  );
  res.json({ ok: true });
});

export default router;
