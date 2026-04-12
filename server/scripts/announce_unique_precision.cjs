const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const TITLE = '[패치] 유니크 드랍 확률 정밀 표시';
const BODY = `사냥터 정보의 유니크 드랍 확률이 소수점 4자리까지 정확하게 표시됩니다.

■ 변경
- 기존: 모든 드랍 확률을 소수점 2자리에서 반올림 → 0.015% 같은 값이 0.02%로 표시되거나 0.00%로 잘려보였습니다.
- 변경: 유니크는 4자리(예: 0.0150%), 일반 드랍은 2자리(예: 5.00%)로 표시.

■ 영향
- 표시만 정밀해진 것이며, 실제 드랍 확률 수치는 변경되지 않았습니다.
- "1킬당 확률, 실제 적용" 문구 그대로, 보이는 값 = 실제 적용 값입니다.

쾌적한 사냥 되세요!`;

(async () => {
  const adminRow = await pool.query("SELECT id FROM users WHERE username = 'admin' LIMIT 1");
  const authorId = adminRow.rows[0]?.id ?? null;
  await pool.query(
    `INSERT INTO announcements (title, body, priority, expires_at, author_id, active)
     VALUES ($1, $2, 'important', NOW() + INTERVAL '7 days', $3, TRUE)`,
    [TITLE, BODY, authorId]
  );
  console.log('공지 등록 완료');
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
