const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const r = await pool.query(
    `UPDATE items SET description = $1 WHERE id = 320`,
    ['고대 문자가 적힌 스크롤 조각. 100개를 모으면 노드 스크롤 +8로 복원할 수 있다. (제작창)']
  );
  console.log(`설명 갱신 ${r.rowCount}행`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
