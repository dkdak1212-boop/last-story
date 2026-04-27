// 종언의 기둥 (Endless Pillar) — 진행/스폰/스케일링 헬퍼
// spec: endless-pillar-spec.md

import { query } from '../db/pool.js';

export const ENDLESS_FIELD_ID = 1000;
export const ENDLESS_TIME_LIMIT_MS = 60_000;            // 1분 / 층
export const ENDLESS_SCALE_PER_FLOOR = 0.03;            // +3% / 층

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

// 사망 — 현재 층 -10 (최소 1층 유지), total_deaths++, paused=true
// 인터뷰 변경 (2026-04-27): 1층 완전 회귀 → -10층으로 완화
export async function recordDeath(characterId: number): Promise<void> {
  await query(
    `UPDATE endless_pillar_progress
       SET current_floor = GREATEST(1, current_floor - 10),
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

// 주간 랭킹 보상 발송 — KST 월요일 00:00 cron 에서 호출.
// 인터뷰 변경 (2026-04-27): 일일 보상 → 주간 보상 + 직업별 별도 랭킹 그룹.
//
// 직업별 처리:
//   - 5 클래스(warrior/mage/rogue/cleric/summoner) 각자 독립된 1~100 랭킹
//   - 같은 클래스 내에서 daily_highest_floor 기준 정렬 (동점 시 daily_highest_at 빠른순)
//   - 각 클래스 200위 안 랜덤 10명에게 보너스 (총 5×10=50 추첨)
//
// reward_mapping.class_name 컬럼:
//   - NULL = 모든 클래스 공용 (현 시드 데이터)
//   - 'warrior' 등 = 해당 클래스 한정 (운영자가 클래스별 보상 차별화 시 사용)
//
// 멱등성: endless_pillar_daily_rewards UNIQUE (send_date, char, item_id, is_random_bonus)
//   - send_date 는 cron 발동 시점 KST 의 "지난 주 시작 월요일" 일자로 기록 (주간 키)
export async function sendWeeklyRewardMails(): Promise<{ mainSent: number; randomSent: number; weekStart: string }> {
  // 지난 주 월요일 (KST) — cron 이 이번 주 월요일 00:00~00:09 발동되니, send_date = 지난 주 월요일
  const dateR = await query<{ d: string }>(
    `SELECT ((NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '7 days')::date::text AS d`
  );
  const weekStart = dateR.rows[0].d;

  let mainSent = 0;
  let randomSent = 0;

  const CLASSES = ['warrior', 'mage', 'rogue', 'cleric', 'summoner'] as const;
  const RANDOM_BONUS_ITEM_ID = 841;
  const RANDOM_BONUS_QTY = 1;
  const RANDOM_PICK_N = 10;

  // 보상 매핑 한 번만 로드 — class_name NULL 또는 매칭 클래스만 적용
  const mappingR = await query<{
    rank: number; item_id: number; quantity: number; description: string | null;
    class_name: string | null;
  }>(
    `SELECT rank, item_id, quantity, description, class_name
       FROM endless_pillar_reward_mapping
      ORDER BY rank, item_id`
  );

  function getRewardsForRank(rank: number, className: string) {
    return mappingR.rows.filter(m =>
      m.rank === rank && (m.class_name === null || m.class_name === className)
    );
  }

  const { deliverToMailbox } = await import('./inventory.js');

  for (const className of CLASSES) {
    // 클래스 내 랭킹 200위 추출
    const rankR = await query<{ character_id: number; daily_highest_floor: number }>(
      `SELECT epp.character_id, epp.daily_highest_floor
         FROM endless_pillar_progress epp
         JOIN characters c ON c.id = epp.character_id
        WHERE epp.daily_highest_floor > 0 AND c.class_name = $1
        ORDER BY epp.daily_highest_floor DESC, epp.daily_highest_at ASC
        LIMIT 200`,
      [className]
    );
    const top200 = rankR.rows;
    if (top200.length === 0) continue;

    // 클래스 1~100위 메인 보상
    const top100 = top200.slice(0, 100);
    for (let i = 0; i < top100.length; i++) {
      const rank = i + 1;
      const entry = top100[i];
      const rewards = getRewardsForRank(rank, className);
      for (const reward of rewards) {
        const dup = await query(
          `INSERT INTO endless_pillar_daily_rewards (send_date, character_id, rank, floor_reached, item_id, quantity, is_random_bonus)
           VALUES ($1, $2, $3, $4, $5, $6, FALSE)
           ON CONFLICT (send_date, character_id, item_id, is_random_bonus) DO NOTHING
           RETURNING id`,
          [weekStart, entry.character_id, rank, entry.daily_highest_floor, reward.item_id, reward.quantity]
        );
        if ((dup.rowCount ?? 0) > 0) {
          await deliverToMailbox(
            entry.character_id,
            `종언의 기둥 주간 랭킹 보상 (${className} ${rank}위)`,
            `${weekStart} 시작 주간 종언의 기둥 ${className} 클래스 ${rank}위 — 도달층 ${entry.daily_highest_floor}층\n\n` +
            (reward.description || '보상 아이템'),
            reward.item_id,
            reward.quantity
          );
          mainSent++;
        }
      }
    }

    // 클래스 200위 안 랜덤 10명 추첨 보너스
    const pool = [...top200];
    const picked: typeof pool = [];
    for (let i = 0; i < Math.min(RANDOM_PICK_N, pool.length); i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    for (const entry of picked) {
      const dup = await query(
        `INSERT INTO endless_pillar_daily_rewards (send_date, character_id, rank, floor_reached, item_id, quantity, is_random_bonus)
         VALUES ($1, $2, NULL, $3, $4, $5, TRUE)
         ON CONFLICT (send_date, character_id, item_id, is_random_bonus) DO NOTHING
         RETURNING id`,
        [weekStart, entry.character_id, entry.daily_highest_floor, RANDOM_BONUS_ITEM_ID, RANDOM_BONUS_QTY]
      );
      if ((dup.rowCount ?? 0) > 0) {
        await deliverToMailbox(
          entry.character_id,
          `종언의 기둥 주간 랜덤 추첨 보상 (${className})`,
          `${weekStart} 시작 주간 종언의 기둥 ${className} 200위 안 랜덤 추첨 당첨 — 도달층 ${entry.daily_highest_floor}층`,
          RANDOM_BONUS_ITEM_ID,
          RANDOM_BONUS_QTY
        );
        randomSent++;
      }
    }
  }

  // 주간 리셋 — daily_highest_floor 가 사실상 weekly_highest 역할 (column 명만 daily 유지)
  await resetDailyHighest();

  return { mainSent, randomSent, weekStart };
}

// KST 월요일 00:00 cron — 1분 단위 호출. 마지막 실행 주간 키를 메모리에 저장,
// 같은 월요일에 두 번 발송되지 않도록 가드.
let lastWeeklyRunKey: string | null = null;

export async function tickWeeklyRewardCron(): Promise<void> {
  // KST 요일 / 시각 조회 (DOW: 0=일~6=토)
  const r = await query<{ kst_date: string; kst_hhmm: string; dow: number }>(
    `SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date::text AS kst_date,
            to_char(NOW() AT TIME ZONE 'Asia/Seoul', 'HH24:MI') AS kst_hhmm,
            EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Asia/Seoul'))::int AS dow`
  );
  const kstDate = r.rows[0].kst_date;
  const kstHhmm = r.rows[0].kst_hhmm;
  const dow = r.rows[0].dow;

  // 월요일(DOW=1) 00:00~00:09 안에서만 발동. 같은 월요일에 한 번만.
  if (dow !== 1) return;
  if (!kstHhmm.startsWith('00:')) return;
  const minutes = parseInt(kstHhmm.split(':')[1], 10);
  if (minutes > 9) return;
  if (lastWeeklyRunKey === kstDate) return;

  console.log(`[endless] weekly reward cron 시작 — KST ${kstDate} ${kstHhmm}`);
  try {
    const result = await sendWeeklyRewardMails();
    console.log(`[endless] weekly reward cron 완료 — weekStart=${result.weekStart} main=${result.mainSent} random=${result.randomSent}`);
    lastWeeklyRunKey = kstDate;
  } catch (e) {
    console.error('[endless] weekly reward cron error:', e);
  }
}
