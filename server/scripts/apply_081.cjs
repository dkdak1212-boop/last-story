const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync(__dirname + '/../../db/migrations/081_mage_signature_burn_dot.sql', 'utf8');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  await c.query(sql);
  const r = await c.query(`SELECT id, name, description FROM skills WHERE class_name='mage' AND name IN ('창세의 빛', '원소 대폭발') ORDER BY id`);
  for (const row of r.rows) console.log(row);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
