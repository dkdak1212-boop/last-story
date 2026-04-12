const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  const r = await pool.query(`SELECT name, effects FROM node_definitions WHERE name = '마력의 흐름'`);
  console.log(JSON.stringify(r.rows[0], null, 2));
  await pool.end();
})();
