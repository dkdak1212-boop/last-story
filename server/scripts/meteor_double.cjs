const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // 운석 폭격: effect_type=dot 유지, effect_value=50 (50% 확률 2회 발동)
  const r = await pool.query(`
    UPDATE skills SET effect_value = 50,
      description = 'MATK x578% + 100, 도트 4행동, 50% 확률 2회 발동'
    WHERE class_name = 'mage' AND name = '운석 폭격'
  `);
  console.log(`운석 폭격 갱신: ${r.rowCount}행`);

  const v = await pool.query(`SELECT name, damage_mult, effect_type, effect_value, effect_duration, description FROM skills WHERE name = '운석 폭격'`);
  console.log(JSON.stringify(v.rows[0], null, 2));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
