const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  try {
    const sql = fs.readFileSync('../db/migrations/084_t3_voucher_tooltip_fix.sql', 'utf8');
    await pool.query(sql);
    await pool.query(`INSERT INTO _migrations (name) VALUES ('084_t3_voucher_tooltip_fix.sql') ON CONFLICT DO NOTHING`);
    const r = await pool.query(`SELECT id, name, description FROM items WHERE id = 911`);
    console.log('updated:', r.rows[0]);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  await pool.end();
})();
