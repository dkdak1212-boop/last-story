const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  const before = await pool.query(
    `SELECT COUNT(*)::int AS used
       FROM characters
      WHERE COALESCE(rift_daily_count,0) > 0
        AND rift_daily_date = (NOW() AT TIME ZONE 'Asia/Seoul')::date`
  );
  console.log(`오늘 시공 입장 사용 캐릭: ${before.rows[0].used}명`);

  const r = await pool.query(
    `UPDATE characters
        SET rift_daily_count = 0,
            rift_daily_date = NULL
      WHERE COALESCE(rift_daily_count,0) > 0
         OR rift_daily_date IS NOT NULL`
  );
  console.log(`초기화 완료: ${r.rowCount}건`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
