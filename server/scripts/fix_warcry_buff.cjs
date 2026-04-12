const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const before = await pool.query(
    "SELECT id, name, effect_type, effect_value, effect_duration FROM skills WHERE class_name = 'warrior' AND name = '전쟁의 함성'"
  );
  console.log('이전:', before.rows);

  const r = await pool.query(
    `UPDATE skills SET effect_type = 'atk_buff', effect_value = 40, effect_duration = 3
     WHERE class_name = 'warrior' AND name = '전쟁의 함성'`
  );
  console.log(`갱신 ${r.rowCount}행`);

  const after = await pool.query(
    "SELECT id, name, effect_type, effect_value, effect_duration FROM skills WHERE class_name = 'warrior' AND name = '전쟁의 함성'"
  );
  console.log('이후:', after.rows);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
