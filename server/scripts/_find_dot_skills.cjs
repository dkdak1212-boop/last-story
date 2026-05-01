const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const r = await c.query(`SELECT id, name, effect_type, effect_value, effect_duration FROM skills WHERE class_name='mage' AND (effect_type LIKE '%dot%' OR description LIKE '%도트%') ORDER BY required_level`);
  for (const row of r.rows) console.log(row);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
