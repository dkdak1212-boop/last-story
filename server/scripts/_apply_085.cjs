const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  try {
    const sql = fs.readFileSync(__dirname + '/../../db/migrations/085_mailbox_soulbound.sql', 'utf8');
    await pool.query(sql);
    await pool.query(`INSERT INTO _migrations (name) VALUES ('085_mailbox_soulbound.sql') ON CONFLICT DO NOTHING`);
    console.log('OK migration 085 applied');
    const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='mailbox' AND column_name='soulbound'");
    console.log('soulbound column:', cols.rows);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  await pool.end();
})();
