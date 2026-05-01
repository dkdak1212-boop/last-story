const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const { rows } = await c.query(
    `SELECT id, name, slot, class_restriction, stats, unique_prefix_stats, description
     FROM items
     WHERE grade = 'unique' AND required_level = 100
     ORDER BY class_restriction NULLS LAST, slot, id`
  );
  for (const r of rows) {
    console.log(`---`);
    console.log(`${r.id} | ${r.name} | slot=${r.slot} | class=${r.class_restriction}`);
    console.log(`stats: ${JSON.stringify(r.stats)}`);
    console.log(`unique: ${JSON.stringify(r.unique_prefix_stats)}`);
    console.log(`desc: ${r.description}`);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
