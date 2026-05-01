const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync(__dirname + '/../../db/migrations/080_rift_breaker_weapons_v2.sql', 'utf8');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  await c.query(sql);
  const r = await c.query(`SELECT id, name, stats, unique_prefix_stats FROM items WHERE id BETWEEN 900 AND 904 ORDER BY id`);
  for (const row of r.rows) {
    console.log(row.id, row.name);
    console.log('  stats:', row.stats);
    console.log('  uniq :', row.unique_prefix_stats);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
