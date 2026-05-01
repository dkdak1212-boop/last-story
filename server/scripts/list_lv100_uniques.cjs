const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const { rows } = await c.query(
    `SELECT id, name, slot, class_restriction, stats::text, unique_prefix_stats::text, description
       FROM items
      WHERE grade='unique' AND required_level=100
      ORDER BY
        CASE slot WHEN 'weapon' THEN 1 WHEN 'helm' THEN 2 WHEN 'chest' THEN 3
                  WHEN 'boots' THEN 4 WHEN 'amulet' THEN 5 WHEN 'ring' THEN 6 ELSE 7 END,
        class_restriction NULLS LAST, id`
  );
  for (const r of rows) {
    console.log(`${r.id}|${r.slot}|${r.class_restriction || '-'}|${r.name}|stats=${r.stats}|u=${r.unique_prefix_stats}|${r.description}`);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
