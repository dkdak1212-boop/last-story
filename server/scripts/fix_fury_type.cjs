const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  await pool.query(`
    UPDATE skills SET effect_type = 'damage', effect_value = 0, effect_duration = 0,
      description = 'ATK x500%, 방어 50% 무시'
    WHERE name = '분노의 일격'
  `);
  const v = await pool.query(`SELECT name, effect_type, effect_value, damage_mult, description FROM skills WHERE name = '분노의 일격'`);
  console.log(JSON.stringify(v.rows[0], null, 2));
  await pool.end();
})();
