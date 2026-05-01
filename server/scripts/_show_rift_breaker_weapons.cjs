const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const r = await c.query(`
    SELECT id, name, slot, required_level, grade,
           stats, unique_prefix_stats, description
      FROM items
     WHERE id BETWEEN 900 AND 904
     ORDER BY id
  `);
  for (const row of r.rows) {
    console.log('====', row.id, row.name, '====');
    console.log('slot:', row.slot, '/ Lv:', row.required_level);
    console.log('stats:', row.stats);
    console.log('unique_prefix_stats:', row.unique_prefix_stats);
    console.log('desc:', row.description);
    console.log('');
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
