const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  const r = await pool.query("SELECT kind, COUNT(*) c, STRING_AGG(class_name || ':' || name, ', ' ORDER BY required_level) AS names FROM skills GROUP BY kind ORDER BY kind");
  for (const row of r.rows) console.log(`[${row.kind}] (${row.c})\n  ${row.names}\n`);
  await pool.end();
})();
