const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync(__dirname + '/../../db/migrations/031_char_create_cooldown.sql', 'utf8');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  await c.query(sql);
  const { rows } = await c.query(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name='users' AND column_name='last_char_deleted_at'`
  );
  for (const r of rows) console.log(`${r.column_name} | ${r.data_type}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
