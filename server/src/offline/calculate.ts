// 오프라인 방치 보상 — 비활성화 (2026-04-19)
// last_online_at 만 갱신하고 null 반환. 재구현 시 git 히스토리에서 복구 가능.

import { query } from '../db/pool.js';

export interface OfflineReport {
  minutesAccounted: number;
  efficiency: number;
  killCount: number;
  expGained: number;
  goldGained: number;
  itemsDropped: { itemId: number; name: string; quantity: number; grade: string }[];
  levelsGained: number;
  overflow: number;
}

export async function generateAndApplyOfflineReport(
  characterId: number,
  _opts: { dryRun?: boolean } = {},
): Promise<OfflineReport | null> {
  await query('UPDATE characters SET last_online_at = NOW() WHERE id = $1', [characterId]);
  return null;
}
