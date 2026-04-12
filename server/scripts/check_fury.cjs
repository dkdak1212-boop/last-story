const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  const r = await pool.query(`SELECT id, name, damage_mult, cooldown_actions, kind, effect_type, effect_value, effect_duration FROM skills WHERE name = '분노의 일격'`);
  console.log(JSON.stringify(r.rows[0], null, 2));
  await pool.end();
})();
