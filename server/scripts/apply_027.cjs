const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync(__dirname + '/../../db/migrations/027_lv100_weapon_desc_fix.sql', 'utf8');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const res = await c.query(sql);
  const last = Array.isArray(res) ? res[res.length - 2] : res;
  const rows = Array.isArray(res) ? (res.find(r => r.rows && r.rows.length)?.rows || []) : res.rows;
  for (const r of rows) {
    console.log(`${r.id} | ${r.name} | ${r.description}`);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
