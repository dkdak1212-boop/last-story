const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  await pool.query(
    `UPDATE skills SET description = '자신 게이지 500 즉시 충전 (자유 행동)' WHERE name = '백스텝'`
  );
  await pool.query(
    `UPDATE skills SET description = '자신 게이지 1000 즉시 충전 (자유 행동)' WHERE name = '그림자 은신'`
  );
  console.log('완료');

  const r = await pool.query(`SELECT name, description FROM skills WHERE name IN ('백스텝','그림자 은신')`);
  for (const s of r.rows) console.log(s.name + ': ' + s.description);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
