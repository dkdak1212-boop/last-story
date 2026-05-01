const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const r = await c.query(`SELECT id, name, slot, required_level, bound_on_pickup FROM items WHERE grade='unique' AND required_level >= 100 ORDER BY required_level, id`);
  for (const row of r.rows) console.log(row.id, row.name, '| lv:', row.required_level, 'bind:', row.bound_on_pickup, 'slot:', row.slot);
  console.log('total:', r.rows.length);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
