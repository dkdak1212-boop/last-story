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

// 일일 랭킹 보상 발송 — KST 자정 cron 에서 호출.
// 단계:
//   1. 어제 (KST) 의 랭킹 산정 (daily_highest_floor > 0, 동점 시 daily_highest_at 빠른순)
//   2. 1~100위에게 매핑된 보상 우편 (item 단위로 row 가 매핑돼있어 한 순위에 복수 row 가능)
//   3. 1~200위 중 랜덤 10명에게 3옵 보장 굴림권(841) 우편 추가
//   4. daily_highest_floor 전부 0 으로 리셋
// 멱등성: endless_pillar_daily_rewards UNIQUE (send_date, char, item_id, is_random_bonus)
export async function sendDailyRewardMails(): Promise<{ mainSent: number; randomSent: number; date: string }> {
  // KST 어제 날짜 — 자정 직후 cron 이라 NOW() KST 의 어제 ?
  // 아니면 cron 호출 시점 = "다음날 00:00 직후" 기준의 "전일" 이 평가 대상.
  // 단순화: cron 발동 시점 KST 의 (CURRENT_DATE - 1) 을 send_date 로 기록.
  const dateR = await query<{ d: string }>(
    `SELECT ((NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '1 day')::date::text AS d`
  );
  const sendDate = dateR.rows[0].d;

  // 1. 랭킹 산정 — 200위까지 (랜덤 보너스 추첨용 포함)
  const rankR = await query<{ character_id: number; daily_highest_floor: number }>(
    `SELECT character_id, daily_highest_floor
       FROM endless_pillar_progress
      WHERE daily_highest_floor > 0
      ORDER BY daily_highest_floor DESC, daily_highest_at ASC
      LIMIT 200`
  );
  const top200 = rankR.rows;
  let mainSent = 0;
  let randomSent = 0;

  // 2. 1~100위 보상 매핑 발송 (rank 별 복수 row 처리)
  const top100 = top200.slice(0, 100);
  if (top100.length > 0) {
    const mappingR = await query<{ rank: number; item_id: number; quantity: number; description: string | null }>(
      `SELECT rank, item_id, quantity, description FROM endless_pillar_reward_mapping ORDER BY rank, item_id`
    );
    const mappingByRank = new Map<number, { item_id: number; quantity: number; description: string | null }[]>();
    for (const m of mappingR.rows) {
      if (!mappingByRank.has(m.rank)) mappingByRank.set(m.rank, []);
      mappingByRank.get(m.rank)!.push({ item_id: m.item_id, quantity: m.quantity, description: m.description });
    }

    const { deliverToMailbox } = await import('./inventory.js');
    for (let i = 0; i < top100.length; i++) {
      const rank = i + 1;
      const entry = top100[i];
      const rewards = mappingByRank.get(rank) || [];
      for (const reward of rewards) {
        // 멱등 가드 — 같은 날 같은 캐릭에게 같은 아이템 (main, 비랜덤) 한 번만
        const dup = await query(
          `INSERT INTO endless_pillar_daily_rewards (send_date, character_id, rank, floor_reached, item_id, quantity, is_random_bonus)
           VALUES ($1, $2, $3, $4, $5, $6, FALSE)
           ON CONFLICT (send_date, character_id, item_id, is_random_bonus) DO NOTHING
           RETURNING id`,
          [sendDate, entry.character_id, rank, entry.daily_highest_floor, reward.item_id, reward.quantity]
        );
        if ((dup.rowCount ?? 0) > 0) {
          await deliverToMailbox(
            entry.character_id,
            `종언의 기둥 일일 랭킹 보상 (${rank}위)`,
            `${sendDate} 종언의 기둥 일일 랭킹 ${rank}위 도달 — 도달층 ${entry.daily_highest_floor}층\n\n` +
            (reward.description || '보상 아이템'),
            reward.item_id,
            reward.quantity
          );
          mainSent++;
        }
      }
    }
  }

  // 3. 1~200위 중 랜덤 10명 추첨 → 3옵 보장 굴림권(841) 추가 우편
  if (top200.length > 0) {
    const RANDOM_BONUS_ITEM_ID = 841;
    const RANDOM_BONUS_QTY = 1;
    const RANDOM_PICK_N = 10;
    const pool = [...top200];
    const picked: typeof pool = [];
    for (let i = 0; i < Math.min(RANDOM_PICK_N, pool.length); i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    const { deliverToMailbox } = await import('./inventory.js');
    for (const entry of picked) {
      const dup = await query(
        `INSERT INTO endless_pillar_daily_rewards (send_date, character_id, rank, floor_reached, item_id, quantity, is_random_bonus)
         VALUES ($1, $2, NULL, $3, $4, $5, TRUE)
         ON CONFLICT (send_date, character_id, item_id, is_random_bonus) DO NOTHING
         RETURNING id`,
        [sendDate, entry.character_id, entry.daily_highest_floor, RANDOM_BONUS_ITEM_ID, RANDOM_BONUS_QTY]
      );
      if ((dup.rowCount ?? 0) > 0) {
        await deliverToMailbox(
          entry.character_id,
          '종언의 기둥 일일 랜덤 추첨 보상',
          `${sendDate} 종언의 기둥 200위 안 랜덤 추첨에 당첨되었습니다 — 도달층 ${entry.daily_highest_floor}층`,
          RANDOM_BONUS_ITEM_ID,
          RANDOM_BONUS_QTY
        );
        randomSent++;
      }
    }
  }

  // 4. daily_highest 리셋
  await resetDailyHighest();

  return { mainSent, randomSent, date: sendDate };
}

// KST 자정 크로싱 감지 cron — 1분 단위 호출. 마지막 실행 자정 시각을 메모리에 저장,
// 같은 자정에 두 번 발송되지 않도록 가드.
let lastDailyRunKstDate: string | null = null;

export async function tickDailyRewardCron(): Promise<void> {
  // KST 시각 기준 시각/일자 조회
  const r = await query<{ kst_date: string; kst_hhmm: string }>(
    `SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date::text AS kst_date,
            to_char(NOW() AT TIME ZONE 'Asia/Seoul', 'HH24:MI') AS kst_hhmm`
  );
  const kstDate = r.rows[0].kst_date;
  const kstHhmm = r.rows[0].kst_hhmm;

  // 자정 직후 (00:00 ~ 00:09) 안에서만 발동. 같은 KST 일자에 한 번만.
  if (!kstHhmm.startsWith('00:')) return;
  const minutes = parseInt(kstHhmm.split(':')[1], 10);
  if (minutes > 9) return;
  if (lastDailyRunKstDate === kstDate) return;

  console.log(`[endless] daily reward cron 시작 — KST ${kstDate} ${kstHhmm}`);
  try {
    const result = await sendDailyRewardMails();
    console.log(`[endless] daily reward cron 완료 — date=${result.date} main=${result.mainSent} random=${result.randomSent}`);
    lastDailyRunKstDate = kstDate;
  } catch (e) {
    console.error('[endless] daily reward cron error:', e);
  }
}
