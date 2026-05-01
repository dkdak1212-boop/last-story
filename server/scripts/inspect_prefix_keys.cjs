const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const { rows } = await c.query('SELECT DISTINCT stat_key FROM item_prefixes ORDER BY stat_key');
  console.log('item_prefixes stat_keys:', rows.map(r => r.stat_key).join(', '));
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
