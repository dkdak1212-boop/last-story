const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const r = await pool.query(`
    UPDATE skills SET
      cooldown_actions = 5,
      damage_mult = 8.00,
      effect_type = 'double_chance',
      effect_value = 50,
      effect_duration = 0,
      description = 'ATK x800%, 50% 확률 2회 발동'
    WHERE class_name = 'warrior' AND name = '최후의 일격'
  `);
  console.log(`최후의 일격 갱신: ${r.rowCount}행`);

  const v = await pool.query(`SELECT name, damage_mult, cooldown_actions, effect_type, effect_value, description FROM skills WHERE name = '최후의 일격'`);
  console.log(JSON.stringify(v.rows[0], null, 2));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
