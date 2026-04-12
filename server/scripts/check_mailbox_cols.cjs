const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  const r = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'mailbox' ORDER BY ordinal_position");
  console.log(r.rows.map(r => `${r.column_name} (${r.data_type})`));
  await pool.end();
})();
