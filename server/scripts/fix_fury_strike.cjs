const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const r = await pool.query(`
    UPDATE skills SET
      damage_mult = 5.00,
      description = 'ATK x500%, 출혈 3행동 (ATK x2.0, 방어 50% 무시)'
    WHERE class_name = 'warrior' AND name = '분노의 일격'
  `);
  console.log(`분노의 일격 갱신: ${r.rowCount}행`);
  const v = await pool.query(`SELECT name, damage_mult, cooldown_actions, effect_type, description FROM skills WHERE name = '분노의 일격'`);
  console.log(JSON.stringify(v.rows[0], null, 2));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
