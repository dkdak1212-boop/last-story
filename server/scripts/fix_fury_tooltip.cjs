const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  await pool.query(
    `UPDATE skills SET description = 'ATK x500%, 출혈 3행동 (ATK x2.0, 방어 50% 무시)' WHERE class_name = 'warrior' AND name = '분노의 일격'`
  );
  const v = await pool.query(`SELECT name, description FROM skills WHERE name = '분노의 일격'`);
  console.log(v.rows[0].name + ': ' + v.rows[0].description);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
