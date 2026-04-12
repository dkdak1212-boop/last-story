const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const r = await pool.query("SELECT id, name, description FROM items WHERE name LIKE '%찢어진%' OR id = 320");
  console.log(JSON.stringify(r.rows, null, 2));

  // 노드 스크롤 craft 정보
  const r2 = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%recipe%' OR table_name LIKE '%craft%'`);
  console.log('craft tables:', r2.rows);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
