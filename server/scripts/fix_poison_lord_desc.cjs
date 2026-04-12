const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const r = await pool.query(
    `UPDATE node_definitions SET description = $1 WHERE name = $2`,
    ['독중첩+3, 독데미지+60% (물리 페널티 제거)', '독의 군주']
  );
  console.log(`설명 갱신 ${r.rowCount}행`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
