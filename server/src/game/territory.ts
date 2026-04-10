// 길드 영토 점령전 — v1.0
// 매주 사냥 점수제, 일요일 23:59 결산, 점령 시 EXP/드랍 +15%

import { query } from '../db/pool.js';

export const TERRITORY_EXP_BONUS_PCT = 15;
export const TERRITORY_DROP_BONUS_PCT = 15;
export const MIN_OCCUPATION_SCORE = 100;

// 이번 주 월요일 (KST 기준)
export function getCurrentWeekStart(): string {
  // UTC 기준으로 단순화 (한국 시간 -9 차이는 무시)
  const now = new Date();
  const day = now.getUTCDay(); // 0=일, 1=월, ..., 6=토
  const diff = day === 0 ? -6 : 1 - day; // 일요일이면 -6, 월요일이면 0
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

// 캐릭터의 사냥 처치 → 길드 영토 점수 +1
export async function addTerritoryScore(characterId: number, fieldId: number): Promise<void> {
  const r = await query<{ guild_id: number }>(
    'SELECT guild_id FROM guild_members WHERE character_id = $1', [characterId]
  );
  if (r.rowCount === 0) return;
  const guildId = r.rows[0].guild_id;
  const week = getCurrentWeekStart();

  await query(
    `INSERT INTO guild_territory_scores (field_id, guild_id, week_start, score)
     VALUES ($1, $2, $3::date, 1)
     ON CONFLICT (field_id, guild_id, week_start) DO UPDATE
       SET score = guild_territory_scores.score + 1`,
    [fieldId, guildId, week]
  );
}

// 캐릭터가 해당 필드 점령 길드 소속이면 보너스 반환
export async function getTerritoryBonusForChar(characterId: number, fieldId: number): Promise<{ expPct: number; dropPct: number }> {
  const r = await query<{ owner_guild_id: number | null; my_guild_id: number | null }>(
    `SELECT t.owner_guild_id,
            (SELECT guild_id FROM guild_members WHERE character_id = $1) AS my_guild_id
     FROM guild_territories t WHERE t.field_id = $2`,
    [characterId, fieldId]
  );
  if (r.rowCount === 0) return { expPct: 0, dropPct: 0 };
  const row = r.rows[0];
  if (!row.owner_guild_id || !row.my_guild_id) return { expPct: 0, dropPct: 0 };
  if (row.owner_guild_id !== row.my_guild_id) return { expPct: 0, dropPct: 0 };
  return { expPct: TERRITORY_EXP_BONUS_PCT, dropPct: TERRITORY_DROP_BONUS_PCT };
}

// 주간 결산: 각 필드의 1위 길드를 점령자로 등록
let lastSettleKey = ''; // 'YYYY-MM-DD' 형식, 일요일 결산 1회 실행 추적

export async function settleTerritoriesIfNeeded(): Promise<void> {
  const now = new Date();
  // 일요일 23:50~23:59 사이에만 실행 (UTC). KST 기준이면 더 빠른 시간이 됨 — 단순화.
  if (now.getUTCDay() !== 0) return;
  if (now.getUTCHours() !== 23) return;
  if (now.getUTCMinutes() < 50) return;

  const todayKey = now.toISOString().slice(0, 10);
  if (lastSettleKey === todayKey) return;
  lastSettleKey = todayKey;

  await settleTerritoriesNow();
}

// 강제 결산 (관리자/테스트용)
export async function settleTerritoriesNow(): Promise<void> {
  const week = getCurrentWeekStart();
  console.log('[territory] settling for week:', week);

  // 모든 필드 ID 조회
  const fr = await query<{ id: number }>('SELECT id FROM fields ORDER BY id');
  for (const f of fr.rows) {
    // 이번 주 1위 길드 조회
    const sr = await query<{ guild_id: number; score: string }>(
      `SELECT guild_id, score FROM guild_territory_scores
       WHERE field_id = $1 AND week_start = $2::date
       ORDER BY score DESC LIMIT 1`,
      [f.id, week]
    );
    const top = sr.rows[0];
    const score = Number(top?.score || 0);

    if (top && score >= MIN_OCCUPATION_SCORE) {
      // 점령자 갱신
      await query(
        `INSERT INTO guild_territories (field_id, owner_guild_id, occupied_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (field_id) DO UPDATE
           SET owner_guild_id = $2, occupied_at = NOW()`,
        [f.id, top.guild_id]
      );
      console.log(`[territory] field ${f.id} → guild ${top.guild_id} (score ${score})`);
    } else {
      // 무점령
      await query(
        `INSERT INTO guild_territories (field_id, owner_guild_id, occupied_at)
         VALUES ($1, NULL, NULL)
         ON CONFLICT (field_id) DO UPDATE
           SET owner_guild_id = NULL, occupied_at = NULL`,
        [f.id]
      );
      console.log(`[territory] field ${f.id} → 무점령 (top score ${score})`);
    }
  }

  // 다음 주를 위해 이전 주 점수 정리 (선택 — 테이블 정리)
  // 1주 이상 지난 점수 삭제
  await query(
    `DELETE FROM guild_territory_scores WHERE week_start < $1::date`,
    [week]
  );
}
