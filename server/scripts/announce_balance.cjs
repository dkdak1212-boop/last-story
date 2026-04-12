const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const TITLE = '[밸런스] 전사/마법사 대규모 상향';
const BODY = `전사와 마법사가 타 직업 대비 딜이 낮았던 문제를 확인하고 상향합니다.

■ 전사 — 딜스킬 계수 ×1.35
모든 전사 딜 스킬의 배율이 35% 증가합니다.
- 대지의 심판: x6.60 → x8.91
- 지옥의 칼날: x6.00 → x8.10
- 최후의 일격: x5.40 → x7.29
- 참수: x4.44 → x5.99
- 기타 전사 딜 스킬 10개 전부 적용

■ 마법사 — 딜스킬 계수 ×1.50 + 자기 디버프 제거
모든 마법사 딜 스킬의 배율이 50% 증가합니다.
- 별의 종말: x6.05 → x9.08
- 차원 붕괴: x4.95 → x7.43
- 태양의 불꽃: x4.40 → x6.60
- 기타 마법사 딜 스킬 11개 전부 적용

마력 과부하/별의 종말의 "자기 속도 감소" 패널티도 제거되었습니다.
이제 불이익 없이 최대 딜을 낼 수 있습니다.

쾌적한 사냥 되세요!`;

(async () => {
  const adminRow = await pool.query("SELECT id FROM users WHERE username = 'admin' LIMIT 1");
  const authorId = adminRow.rows[0]?.id ?? null;
  await pool.query(
    `INSERT INTO announcements (title, body, priority, expires_at, author_id, active)
     VALUES ($1, $2, 'urgent', NOW() + INTERVAL '10 days', $3, TRUE)`,
    [TITLE, BODY, authorId]
  );
  console.log('공지 등록 완료');
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
