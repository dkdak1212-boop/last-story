// 스탯/노드 포인트 오버 자동 감지·정리
// 기댓값: 스탯 (L-1)×2, 노드 L-1
// 소비(할당/spent) + 미소비(stat_points/node_points) 가 기댓값 초과 시
// 미소비부터 차감. allocated/spent 는 건드리지 않음 (유저 빌드 보존).

import { query } from '../db/pool.js';
import { CLASS_START, type ClassName } from './classes.js';

const CLAMP_INTERVAL_MS = 10 * 60 * 1000; // 10분

export interface ClampResult {
  statCharsFixed: number;
  statPointsRemoved: number;
  nodeCharsFixed: number;
  nodePointsRemoved: number;
}

export async function clampOverflowPoints(): Promise<ClampResult> {
  let statCharsFixed = 0, statPointsRemoved = 0;
  let nodeCharsFixed = 0, nodePointsRemoved = 0;

  const chars = await query<{
    id: number; class_name: string; level: number;
    stats: Record<string, number>; stat_points: number | null; node_points: number;
  }>(
    `SELECT id, class_name, level, stats,
            COALESCE(stat_points, 0) AS stat_points, node_points
       FROM characters`
  );

  const spentR = await query<{ character_id: number; total: string }>(
    `SELECT cn.character_id, COALESCE(SUM(nd.cost), 0)::text AS total
       FROM character_nodes cn
       JOIN node_definitions nd ON nd.id = cn.node_id
      GROUP BY cn.character_id`
  );
  const spentMap = new Map(spentR.rows.map(r => [r.character_id, Number(r.total)]));

  for (const c of chars.rows) {
    const start = CLASS_START[c.class_name as ClassName];
    if (!start) continue;

    const cur = c.stats || {};
    const allocated =
      Math.max(0, (cur.str ?? start.stats.str) - start.stats.str) +
      Math.max(0, (cur.dex ?? start.stats.dex) - start.stats.dex) +
      Math.max(0, (cur.int ?? start.stats.int) - start.stats.int) +
      Math.max(0, (cur.vit ?? start.stats.vit) - start.stats.vit);
    const expectedStat = Math.max(0, (c.level - 1) * 2);
    const sp = c.stat_points || 0;
    const totalStat = allocated + sp;
    if (totalStat > expectedStat) {
      const excess = totalStat - expectedStat;
      const removable = Math.min(excess, sp);
      if (removable > 0) {
        await query('UPDATE characters SET stat_points = stat_points - $1 WHERE id = $2', [removable, c.id]);
        statCharsFixed++;
        statPointsRemoved += removable;
      }
    }

    const nodeSpent = spentMap.get(c.id) || 0;
    const expectedNode = Math.max(0, c.level - 1);
    const totalNode = nodeSpent + c.node_points;
    if (totalNode > expectedNode) {
      const excess = totalNode - expectedNode;
      const removable = Math.min(excess, c.node_points);
      if (removable > 0) {
        await query('UPDATE characters SET node_points = node_points - $1 WHERE id = $2', [removable, c.id]);
        nodeCharsFixed++;
        nodePointsRemoved += removable;
      }
    }
  }

  return { statCharsFixed, statPointsRemoved, nodeCharsFixed, nodePointsRemoved };
}

// 단일 캐릭터용 — 포인트 지급 직후 호출. 실패해도 무시 (주기 clamper 가 백업).
export async function clampCharacterPoints(characterId: number): Promise<void> {
  try {
    const cr = await query<{
      class_name: string; level: number;
      stats: Record<string, number>; stat_points: number | null; node_points: number;
    }>(
      `SELECT class_name, level, stats,
              COALESCE(stat_points, 0) AS stat_points, node_points
         FROM characters WHERE id = $1`, [characterId]
    );
    const c = cr.rows[0];
    if (!c) return;
    const start = CLASS_START[c.class_name as ClassName];
    if (!start) return;

    const cur = c.stats || {};
    const allocated =
      Math.max(0, (cur.str ?? start.stats.str) - start.stats.str) +
      Math.max(0, (cur.dex ?? start.stats.dex) - start.stats.dex) +
      Math.max(0, (cur.int ?? start.stats.int) - start.stats.int) +
      Math.max(0, (cur.vit ?? start.stats.vit) - start.stats.vit);
    const expectedStat = Math.max(0, (c.level - 1) * 2);
    const sp = c.stat_points || 0;
    const statExcess = (allocated + sp) - expectedStat;
    if (statExcess > 0) {
      const removable = Math.min(statExcess, sp);
      if (removable > 0) {
        await query('UPDATE characters SET stat_points = stat_points - $1 WHERE id = $2', [removable, characterId]);
      }
    }

    const spentR = await query<{ total: string }>(
      `SELECT COALESCE(SUM(nd.cost), 0)::text AS total
         FROM character_nodes cn JOIN node_definitions nd ON nd.id = cn.node_id
        WHERE cn.character_id = $1`, [characterId]
    );
    const nodeSpent = Number(spentR.rows[0]?.total || 0);
    const expectedNode = Math.max(0, c.level - 1);
    const nodeExcess = (nodeSpent + c.node_points) - expectedNode;
    if (nodeExcess > 0) {
      const removable = Math.min(nodeExcess, c.node_points);
      if (removable > 0) {
        await query('UPDATE characters SET node_points = node_points - $1 WHERE id = $2', [removable, characterId]);
      }
    }
  } catch (e) {
    console.error('[clamp] clampCharacterPoints err', characterId, e);
  }
}

let clampInterval: NodeJS.Timeout | null = null;
export function startPointClamper(): void {
  if (clampInterval) return;
  clampInterval = setInterval(async () => {
    try {
      const r = await clampOverflowPoints();
      if (r.statCharsFixed > 0 || r.nodeCharsFixed > 0) {
        console.log(
          `[clamp] stat ${r.statCharsFixed} chars -${r.statPointsRemoved}pt · ` +
          `node ${r.nodeCharsFixed} chars -${r.nodePointsRemoved}pt`
        );
      }
    } catch (e) {
      console.error('[clamp] error:', e);
    }
  }, CLAMP_INTERVAL_MS);
  console.log('[clamp] point clamper started (10min interval)');
}
