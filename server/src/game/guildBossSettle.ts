import { query } from '../db/pool.js';
import { deliverToMailbox } from './inventory.js';

// 주간 결산 — 일요일 22:00 KST 1회 실행
// 최근 7일 guild_boss_guild_daily.total_damage 합계 기준 상위 3길드에 메달 보상 지급.
// 1위: 메달 200 + "왕좌" 호칭 7일 (전 길드원). 2위 100, 3위 50.
// 서버 전광판(announcements) 에 공지 등록.

let lastSettleKey = '';

export async function settleGuildBossWeeklyIfNeeded(): Promise<void> {
  // KST 기준 요일/시각 조회
  const r = await query<{ dow: number; hr: number; today: string }>(
    `SELECT EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Asia/Seoul'))::int AS dow,
            EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Seoul'))::int AS hr,
            (NOW() AT TIME ZONE 'Asia/Seoul')::date::text AS today`
  );
  const { dow, hr, today } = r.rows[0];

  // KST 일요일 = DOW 0
  if (dow !== 0) return;
  if (hr !== 22) return;

  if (lastSettleKey === today) return;
  lastSettleKey = today;

  await settleGuildBossWeeklyNow();
}

// 강제 결산 (관리자/수동 테스트용 — 멱등)
export async function settleGuildBossWeeklyNow(): Promise<{ settled: boolean; reason?: string; rankings?: any[] }> {
  // 오늘 KST 일요일
  const todayR = await query<{ d: string }>(
    `SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date::text AS d`
  );
  const weekEnding = todayR.rows[0].d;

  // 이미 정산됐으면 skip
  const existR = await query('SELECT 1 FROM guild_boss_weekly_settlements WHERE week_ending = $1', [weekEnding]);
  if (existR.rowCount) return { settled: false, reason: 'already_settled' };

  // 지난 7일간 (오늘 포함) 길드별 누적 데미지
  const rankR = await query<{ guild_id: number; guild_name: string; total_damage: string }>(
    `SELECT gd.guild_id, g.name AS guild_name, SUM(gd.total_damage)::text AS total_damage
     FROM guild_boss_guild_daily gd
     JOIN guilds g ON g.id = gd.guild_id
     WHERE gd.date BETWEEN ($1::date - INTERVAL '6 day')::date AND $1::date
     GROUP BY gd.guild_id, g.name
     HAVING SUM(gd.total_damage) > 0
     ORDER BY SUM(gd.total_damage) DESC
     LIMIT 10`,
    [weekEnding]
  );

  const ranking = rankR.rows.map((r, i) => ({
    rank: i + 1,
    guild_id: r.guild_id,
    guild_name: r.guild_name,
    total_damage: r.total_damage,
  }));

  // 상위 3 길드에 보상 지급
  const MEDAL_REWARDS: Record<number, number> = { 1: 200, 2: 100, 3: 50 };
  for (const entry of ranking.slice(0, 3)) {
    const medals = MEDAL_REWARDS[entry.rank]!;
    const memberR = await query<{ character_id: number }>(
      `SELECT character_id FROM guild_members WHERE guild_id = $1`,
      [entry.guild_id]
    );
    for (const m of memberR.rows) {
      // 메달 지급
      await query(
        'UPDATE characters SET guild_boss_medals = guild_boss_medals + $1 WHERE id = $2',
        [medals, m.character_id]
      );
      // 1위 길드원 전원에게 왕좌 호칭 7일
      if (entry.rank === 1) {
        await query(
          `UPDATE characters
           SET transient_title = '왕좌',
               transient_title_expires_at = NOW() + INTERVAL '7 days'
           WHERE id = $1`,
          [m.character_id]
        );
      }
      // 우편 발송 (보상 자체는 이미 지급됐고, 알림용)
      const title = `길드 보스 주간 결산 — ${entry.rank}위`;
      const body = entry.rank === 1
        ? `🏆 축하합니다! 길드 "${entry.guild_name}"가 이번 주 1위를 차지했습니다.\n전 길드원에게 메달 +${medals} 및 "왕좌" 호칭 7일이 지급되었습니다.`
        : `"${entry.guild_name}" 길드가 이번 주 ${entry.rank}위를 차지했습니다. 전 길드원에게 메달 +${medals} 지급.`;
      await deliverToMailbox(m.character_id, title, body, 0, 0, 0).catch((e) => {
        console.error('[guild-boss-settle] mail fail', m.character_id, e);
      });
    }
  }

  // 전광판 공지 (상위 3 길드 이름 나열)
  try {
    if (ranking.length > 0) {
      const top1 = ranking[0];
      const noticeBody = ranking.slice(0, 3).map(r => `${r.rank}위: ${r.guild_name} (${Number(r.total_damage).toLocaleString()} 누적)`).join('\n');
      const full = `🏆 이번 주 길드 보스 1위: ${top1.guild_name}! 왕좌 호칭 7일 지급.\n\n${noticeBody}`;
      await query(
        `INSERT INTO announcements (title, body, priority, expires_at, author_id, active)
         VALUES ($1, $2, 'important', NOW() + INTERVAL '24 hours', NULL, TRUE)`,
        ['길드 보스 주간 결산', full]
      );
    }
  } catch (e) {
    console.error('[guild-boss-settle] announcement fail', e);
  }

  // 결산 기록
  await query(
    `INSERT INTO guild_boss_weekly_settlements (week_ending, rankings) VALUES ($1, $2::jsonb)`,
    [weekEnding, JSON.stringify(ranking)]
  );

  console.log(`[guild-boss-settle] 주간 결산 완료: week_ending=${weekEnding}, 상위 ${Math.min(3, ranking.length)}길드 보상 지급`);
  return { settled: true, rankings: ranking };
}

// 만료된 왕좌 호칭 정리 (5분마다 호출 — transient_title 이 expires_at 지났는지 체크)
export async function cleanExpiredTransientTitles(): Promise<void> {
  await query(
    `UPDATE characters
     SET transient_title = NULL, transient_title_expires_at = NULL
     WHERE transient_title_expires_at IS NOT NULL
       AND transient_title_expires_at < NOW()`
  );
}
