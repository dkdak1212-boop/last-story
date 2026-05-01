const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  // 평균값 보상 발송 시점 추정: 2026-04-30 09:30 KST 부근 (mailbox 보상 메일 created_at)
  const compR = await pool.query(`SELECT MIN(created_at)::text AS first, MAX(created_at)::text AS last FROM mailbox WHERE subject = '평균값 초기화 보상'`);
  console.log(`보상 발송: ${compR.rows[0].first} ~ ${compR.rows[0].last}`);

  // 보상 받은 904명 중 — 보상 수령 후(시점 기준) 처음 로그인한 캐릭 수
  // last_online_at > 보상 발송 시점 → "보상 후 접속"
  const r = await pool.query(`
    WITH compensated AS (
      SELECT DISTINCT character_id, MIN(created_at) AS sent_at
        FROM mailbox WHERE subject = '평균값 초기화 보상'
        GROUP BY character_id
    )
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE c.last_online_at > comp.sent_at)::int AS logged_after_comp,
      COUNT(*) FILTER (WHERE c.last_online_at < comp.sent_at - INTERVAL '24 hours')::int AS dormant_24h,
      COUNT(*) FILTER (WHERE c.last_online_at < comp.sent_at - INTERVAL '24 hours' AND c.last_online_at > comp.sent_at - INTERVAL '7 days')::int AS dormant_24h_7d,
      COUNT(*) FILTER (WHERE c.last_online_at < comp.sent_at - INTERVAL '7 days')::int AS dormant_7d_plus
      FROM compensated comp
      JOIN characters c ON c.id = comp.character_id`);
  const x = r.rows[0];
  console.log(`\n=== 평균값 보상 수령 캐릭 분석 ===`);
  console.log(`보상 받은 캐릭: ${x.total}명`);
  console.log(`보상 후 1회 이상 접속: ${x.logged_after_comp}명 (${(x.logged_after_comp/x.total*100).toFixed(1)}%)`);
  console.log(`보상 시점 24시간 이상 휴면이었던 캐릭: ${x.dormant_24h}명`);
  console.log(`  └ 1~7일 휴면: ${x.dormant_24h_7d}명`);
  console.log(`  └ 7일 이상 휴면: ${x.dormant_7d_plus}명`);

  // 그 휴면 유저 중 보상 후 복귀한 비율
  const r2 = await pool.query(`
    WITH compensated AS (
      SELECT DISTINCT character_id, MIN(created_at) AS sent_at
        FROM mailbox WHERE subject = '평균값 초기화 보상'
        GROUP BY character_id
    )
    SELECT
      COUNT(*) FILTER (WHERE c.last_online_at < comp.sent_at - INTERVAL '24 hours' AND c.last_online_at > comp.sent_at - INTERVAL '7 days' AND c.last_online_at > comp.sent_at - INTERVAL '6 days')::int AS d24_returned,
      COUNT(*) FILTER (WHERE c.last_online_at < comp.sent_at - INTERVAL '7 days' AND c.last_online_at > comp.sent_at - INTERVAL '7 days')::int AS d7_returned,
      COUNT(*) FILTER (WHERE c.last_online_at > comp.sent_at)::int AS active_post_comp
      FROM compensated comp
      JOIN characters c ON c.id = comp.character_id
      WHERE c.last_online_at < comp.sent_at - INTERVAL '24 hours'`);
  const y = r2.rows[0];
  console.log(`\n=== 휴면 캐릭(24h+) 중 보상 후 복귀 ===`);

  // 가장 직접 척도 — 휴면이었지만 last_online_at 이 보상 발송 시점 이후로 갱신됨
  const r3 = await pool.query(`
    WITH compensated AS (
      SELECT DISTINCT character_id, MIN(created_at) AS sent_at
        FROM mailbox WHERE subject = '평균값 초기화 보상'
        GROUP BY character_id
    )
    SELECT
      COUNT(*) FILTER (WHERE c.last_online_at > comp.sent_at AND c.last_online_at - comp.sent_at < INTERVAL '24 hours')::int AS returned_within_24h_dormant,
      COUNT(*) FILTER (WHERE c.last_online_at > comp.sent_at AND comp.sent_at - c.last_online_at > INTERVAL '7 days')::int AS hmm
    FROM compensated comp
    JOIN characters c ON c.id = comp.character_id
    WHERE comp.sent_at - c.last_online_at > INTERVAL '24 hours'  -- 휴면이었던 캐릭만
      AND c.last_online_at > comp.sent_at  -- 보상 후 복귀`);
  // 위 쿼리는 모순 (last_online_at < sent_at AND > sent_at). 다시 단순화
  const r4 = await pool.query(`
    WITH compensated AS (
      SELECT DISTINCT character_id, MIN(created_at) AS sent_at
        FROM mailbox WHERE subject = '평균값 초기화 보상'
        GROUP BY character_id
    ),
    dormant_chars AS (
      SELECT comp.character_id, comp.sent_at, c.last_online_at
        FROM compensated comp
        JOIN characters c ON c.id = comp.character_id
        WHERE c.last_online_at IS NOT NULL
    )
    SELECT
      COUNT(*) FILTER (WHERE last_online_at > sent_at)::int AS post_comp_active,
      COUNT(*) FILTER (WHERE last_online_at > sent_at AND last_online_at - INTERVAL '24 hours' > sent_at)::int AS active_24h_after_comp,
      COUNT(*)::int AS total
    FROM dormant_chars`);
  console.log(`\n=== 보상 수령 캐릭 활동 (현재 기준) ===`);
  console.log(`총 ${r4.rows[0].total}명 중`);
  console.log(`보상 시점 이후 접속: ${r4.rows[0].post_comp_active}명 (${(r4.rows[0].post_comp_active/r4.rows[0].total*100).toFixed(1)}%)`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
