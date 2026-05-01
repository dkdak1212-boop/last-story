const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  // 시공/차원/균열 + 장비(slot 있는 것)만
  const r = await c.query(`SELECT id, name, slot, required_level, grade, bound_on_pickup FROM items WHERE (name LIKE '%시공%' OR name LIKE '%차원%' OR name LIKE '%균열%') AND slot IS NOT NULL ORDER BY required_level, id`);
  for (const row of r.rows) console.log(row.id, row.name, '| slot:', row.slot, 'lv:', row.required_level, 'bind:', row.bound_on_pickup, 'grade:', row.grade);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
