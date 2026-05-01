const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const r = await c.query(`SELECT id, class_name, name, description, damage_mult, effect_type, effect_value, effect_duration, cooldown_actions FROM skills WHERE name IN ('창세의 빛', '창세의빛', '원소 대폭발', '원소대폭발', '원소 대폭팔', '원소대폭팔') OR name LIKE '%창세%' OR name LIKE '%원소%' ORDER BY class_name, required_level`);
  for (const row of r.rows) console.log(row);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
