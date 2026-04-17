const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  const newTitle = '[긴급 패치] 소환사 노드트리 개편 · 재굴림권 개선 · 전사 버그 수정 · 재충전 조정';
  const r = await pool.query(
    `UPDATE announcements
     SET priority='urgent', title=$1, active=TRUE, expires_at=NOW() + INTERVAL '7 days'
     WHERE id=43
     RETURNING id, title, priority, active`,
    [newTitle]
  );
  console.log(r.rows);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
