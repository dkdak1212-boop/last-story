const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  const r = await pool.query(`SELECT id, name, description FROM items WHERE name LIKE '%추첨권%' OR name LIKE '%접두사%' OR name LIKE '%T1%' OR name LIKE '%T2%' OR name LIKE '%T3%' OR name LIKE '%T4%' ORDER BY id`);
  console.log('voucher-like items:');
  r.rows.forEach(i => console.log(`  [${i.id}] ${i.name} - ${(i.description || '').slice(0, 80)}`));
  await pool.end();
})();
