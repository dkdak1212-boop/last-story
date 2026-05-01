const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  await c.query(`UPDATE items SET grade = 'common' WHERE id BETWEEN 846 AND 851`);
  const { rows } = await c.query(`SELECT id, name, grade FROM items WHERE id BETWEEN 846 AND 851 ORDER BY id`);
  for (const r of rows) console.log(`${r.id} | ${r.name} | ${r.grade}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
