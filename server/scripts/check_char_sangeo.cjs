const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const { rows } = await c.query(
    `SELECT id, user_id, name, class_name, level, exp, exp_boost_until
     FROM characters WHERE name = $1`, ['상어']
  );
  for (const r of rows) {
    console.log(`char_id=${r.id} user_id=${r.user_id} name=${r.name} class=${r.class_name} level=${r.level} exp=${r.exp} boost_until=${r.exp_boost_until}`);
  }
  if (rows.length === 0) console.log('no character named 상어 found');
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
