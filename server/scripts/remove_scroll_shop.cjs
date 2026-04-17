const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const before = await pool.query(`SELECT * FROM shop_entries WHERE item_id = 320`);
  console.log('삭제 전:', before.rows);
  const r = await pool.query(`DELETE FROM shop_entries WHERE item_id = 320`);
  console.log(`DELETE rowCount: ${r.rowCount}`);
  const after = await pool.query(`SELECT * FROM shop_entries WHERE item_id = 320`);
  console.log('삭제 후:', after.rows);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
