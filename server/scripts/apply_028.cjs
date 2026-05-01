const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync(__dirname + '/../../db/migrations/028_personal_exp_mult.sql', 'utf8');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  await c.query(sql);
  const { rows } = await c.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name='characters' AND column_name LIKE 'personal_exp%'
    ORDER BY column_name
  `);
  for (const r of rows) console.log(`${r.column_name} | ${r.data_type} | default=${r.column_default}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
