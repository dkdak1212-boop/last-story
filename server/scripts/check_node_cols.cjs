const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'node_definitions' ORDER BY ordinal_position");
  console.log(r.rows.map(r => r.column_name));
  const sample = await pool.query("SELECT * FROM node_definitions LIMIT 3");
  console.log(JSON.stringify(sample.rows, null, 2));
  await pool.end();
})();
