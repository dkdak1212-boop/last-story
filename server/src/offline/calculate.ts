// 오프라인 진행 보상 — 비활성화 (재설계 대기)
// 이전 구현은 git 히스토리에서 복구 가능.
//
// 현재 동작: last_online_at 만 갱신하고 null 반환.
// /api/characters/:id/offline/resume 는 여전히 호출되지만 report 가 null 이라
// 클라에는 '방치 보상 없음' 상태로 표시됨. 전투 자동 재시작 로직은 유지.

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
  characterId: number
): Promise<OfflineReport | null> {
  // 보상 계산 전면 중단 — last_online_at 만 현재 시각으로 갱신
  await query('UPDATE characters SET last_online_at = NOW() WHERE id = $1', [characterId]);
  return null;
}
