const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const before = await pool.query(`SELECT id, name, description FROM items WHERE name IN ('접두사 재굴림권', '접두사 수치 재굴림권')`);
  console.log('변경 전:', before.rows);

  const r = await pool.query(
    `UPDATE items SET name = '접두사 수치 재굴림권',
       description = '장비 접두사의 tier/옵션은 그대로 두고 수치만 새로 굴립니다. 강화 메뉴에서 사용할 수 있습니다.'
     WHERE name = '접두사 재굴림권' RETURNING id, name`
  );
  console.log(`UPDATE rowCount: ${r.rowCount}`);

  const after = await pool.query(`SELECT id, name, description FROM items WHERE id = ANY($1::int[])`, [before.rows.map(x => x.id).concat(r.rows.map(x => x.id))]);
  console.log('변경 후:', after.rows);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
