const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const r = await c.query(`SELECT id, name, slot, required_level, bound_on_pickup FROM items WHERE id BETWEEN 900 AND 909 ORDER BY id`);
  for (const row of r.rows) console.log(row.id, row.name, '| slot:', row.slot, 'lv:', row.required_level, 'bind:', row.bound_on_pickup);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
