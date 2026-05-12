const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  try {
    const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'item_prefixes'`);
    console.log('item_prefixes cols:', cols.rows.map(r => r.column_name).join(', '));
    const all = new Set();
    try {
      const r2 = await pool.query(`SELECT DISTINCT jsonb_object_keys(unique_prefix_stats) AS k FROM items WHERE unique_prefix_stats IS NOT NULL`);
      r2.rows.forEach(x => all.add(x.k));
    } catch (e) { console.log('items skip:', e.message); }
    // try common columns for prefixes
    for (const c of ['stat', 'stats', 'value_pool', 'effects']) {
      try {
        const r = await pool.query(`SELECT DISTINCT jsonb_object_keys(${c}) AS k FROM item_prefixes`);
        r.rows.forEach(x => all.add(x.k));
        console.log(`item_prefixes.${c} keys added`);
      } catch {}
    }
    // Also from character_inventory.prefix_stats
    try {
      const r3 = await pool.query(`SELECT DISTINCT jsonb_object_keys(prefix_stats) AS k FROM character_inventory WHERE prefix_stats IS NOT NULL`);
      r3.rows.forEach(x => all.add(x.k));
    } catch (e) {}
    try {
      const r4 = await pool.query(`SELECT DISTINCT jsonb_object_keys(prefix_stats) AS k FROM character_equipped WHERE prefix_stats IS NOT NULL`);
      r4.rows.forEach(x => all.add(x.k));
    } catch (e) {}
    console.log('ALL PREFIX KEYS:', [...all].sort().join(', '));
  } finally { await pool.end(); }
})().catch(e => { console.error(e); process.exit(1); });
