const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'craft_recipes'");
  console.log('cols:', cols.rows.map(r => r.column_name));
  const r = await pool.query("SELECT * FROM craft_recipes LIMIT 20");
  console.log(JSON.stringify(r.rows, null, 2));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
