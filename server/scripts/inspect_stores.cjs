const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const tables = ['character_inventory', 'character_equipped', 'mailbox', 'auctions', 'account_storage_items', 'guild_storage_items'];
  for (const t of tables) {
    const q = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1`, [t]);
    const cols = q.rows.map(r => r.column_name);
    console.log(`${t}: ${cols.includes('prefix_stats') ? 'prefix_stats' : 'NO_prefix_stats'} | ${cols.includes('prefix_ids') ? 'prefix_ids' : 'NO_prefix_ids'} | ${cols.includes('item_id') ? 'item_id' : 'NO_item_id'} | rows=${cols.length}`);
  }
  for (const t of tables) {
    try {
      const { rows } = await c.query(`SELECT COUNT(*)::int AS n FROM ${t} WHERE item_id BETWEEN 800 AND 814`);
      console.log(`${t}: uniq100 rows = ${rows[0].n}`);
    } catch (e) { console.log(`${t}: err ${e.message}`); }
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
