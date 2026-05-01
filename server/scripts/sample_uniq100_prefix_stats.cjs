const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const { rows } = await c.query(`
    SELECT ci.id, ci.item_id, i.name, i.unique_prefix_stats::text AS current_unique,
           ci.prefix_ids, ci.prefix_stats::text AS stored_prefix_stats
    FROM character_inventory ci JOIN items i ON i.id = ci.item_id
    WHERE ci.item_id BETWEEN 800 AND 814
    ORDER BY ci.item_id LIMIT 20
  `);
  for (const r of rows) {
    console.log(`[${r.item_id} ${r.name}] curUnique=${r.current_unique} | prefix_ids=${JSON.stringify(r.prefix_ids)} | stored=${r.stored_prefix_stats}`);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
