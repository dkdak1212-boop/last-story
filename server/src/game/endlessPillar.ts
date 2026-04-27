// 종언의 기둥 (Endless Pillar) — 진행/스폰/스케일링 헬퍼
// spec: endless-pillar-spec.md

import { query } from '../db/pool.js';

export const ENDLESS_FIELD_ID = 1000;
export const ENDLESS_TIME_LIMIT_MS = 60_000;            // 1분 / 층
export const ENDLESS_SCALE_PER_FLOOR = 0.025;           // +2.5% / 층

const NORMAL_MONSTER_IDS = [503, 504, 505, 506, 507];
const BOSS_MONSTER_IDS = [508, 509, 510, 511, 512, 513, 514, 515, 516, 517];

export interface EndlessProgress {
  character_id: number;
  current_floor: number;
  current_hp: number;
  paused: boolean;
  highest_floor: number;
  daily_highest_floor: number;
  daily_highest_at: string | null;
  total_kills: string;        // bigint as string
  total_deaths: number;
}

export function isBossFloor(floor: number): boolean {
  return floor > 0 && floor % 100 === 0;
}

// 보스 풀 인덱스 — 100/200/300 에서 0/1/2 ... 1100층 = 0 (순환)
export function bossMonsterIdForFloor(floor: number): number {
  const idx = (Math.floor(floor / 100) - 1) % BOSS_MONSTER_IDS.length;
  return BOSS_MONSTER_IDS[(idx + BOSS_MONSTER_IDS.length) % BOSS_MONSTER_IDS.length];
}

export function pickNormalMonsterId(): number {
  return NORMAL_MONSTER_IDS[Math.floor(Math.random() * NORMAL_MONSTER_IDS.length)];
}

export function getMonsterIdForFloor(floor: number): number {
  return isBossFloor(floor) ? bossMonsterIdForFloor(floor) : pickNormalMonsterId();
}

export function getScaleMultiplier(floor: number): number {
  return 1 + (Math.max(1, floor) - 1) * ENDLESS_SCALE_PER_FLOOR;
}

// 진행 상태 로드 (없으면 INSERT 후 기본값 반환)
export async function loadOrCreateProgress(characterId: number): Promise<EndlessProgress> {
  const r = await query<EndlessProgress>(
    `INSERT INTO endless_pillar_progress (character_id) VALUES ($1)
     ON CONFLICT (character_id) DO UPDATE SET last_updated = NOW()
     RETURNING *`,
    [characterId]
  );
  return r.rows[0];
}

export async function loadProgress(characterId: number): Promise<EndlessProgress | null> {
  const r = await query<EndlessProgress>(
    `SELECT * FROM endless_pillar_progress WHERE character_id = $1`,
    [characterId]
  );
  return r.rows[0] ?? null;
}

// 일시정지 — 외부 이동 / 세션 끊김 시 호출. current_hp 와 함께 저장.
export async function pauseProgress(characterId: number, currentHp: number): Promise<void> {
  await query(
    `UPDATE endless_pillar_progress
       SET paused = TRUE, current_hp = $2, last_updated = NOW()
     WHERE character_id = $1`,
    [characterId, Math.max(0, Math.floor(currentHp))]
  );
}

// 진입 — paused=false, current_hp 가 0 이면 max_hp 로 초기화.
export async function resumeProgress(characterId: number, fallbackMaxHp: number): Promise<EndlessProgress> {
  const cur = await loadOrCreateProgress(characterId);
  let hp = cur.current_hp;
  if (hp <= 0) hp = fallbackMaxHp;
  const r = await query<EndlessProgress>(
    `UPDATE endless_pillar_progress
       SET paused = FALSE, current_hp = $2, last_updated = NOW()
     WHERE character_id = $1
     RETURNING *`,
    [characterId, hp]
  );
  return r.rows[0];
}

// 층 클리어 — 다음 층으로 진행, daily_highest/highest 갱신, floor_log 추가
export async function recordFloorClear(
  characterId: number,
  clearedFloor: number,
  clearTimeMs: number
): Promise<{ newFloor: number; isBoss: boolean; newDailyHighest: boolean }> {
  await query(
    `INSERT INTO endless_pillar_floor_log (character_id, floor, clear_time_ms)
     VALUES ($1, $2, $3)`,
    [characterId, clearedFloor, Math.max(0, Math.floor(clearTimeMs))]
  );
  const newFloor = clearedFloor + 1;
  // daily_highest 는 최고치 갱신 시 daily_highest_at 도 갱신 (동점 처리용 — 첫 도달 시각).
  const r = await query<{ daily_highest_floor: number }>(
    `UPDATE endless_pillar_progress
       SET current_floor = $2,
           total_kills = total_kills + 1,
           highest_floor = GREATEST(highest_floor, $2),
           daily_highest_floor = GREATEST(daily_highest_floor, $2),
           daily_highest_at = CASE
             WHEN $2 > daily_highest_floor THEN NOW()
             ELSE daily_highest_at
           END,
           last_updated = NOW()
     WHERE character_id = $1
     RETURNING daily_highest_floor`,
    [characterId, newFloor]
  );
  return {
    newFloor,
    isBoss: isBossFloor(clearedFloor),  // 방금 클리어한 층이 보스였는지
    newDailyHighest: (r.rows[0]?.daily_highest_floor ?? 0) === newFloor,
  };
}

// 사망 — 1층 회귀, total_deaths++, paused=true
export async function recordDeath(characterId: number): Promise<void> {
  await query(
    `UPDATE endless_pillar_progress
       SET current_floor = 1,
           current_hp = 0,
           paused = TRUE,
           total_deaths = total_deaths + 1,
           last_updated = NOW()
     WHERE character_id = $1`,
    [characterId]
  );
}

// 매일 자정 (KST) 호출 — daily_highest 0 으로 리셋
export async function resetDailyHighest(): Promise<number> {
  const r = await query(
    `UPDATE endless_pillar_progress
       SET daily_highest_floor = 0,
           daily_highest_at = NULL,
           last_updated = NOW()
     WHERE daily_highest_floor > 0`
  );
  return r.rowCount ?? 0;
}
