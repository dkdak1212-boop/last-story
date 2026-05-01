const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const { rows } = await c.query(`SELECT * FROM items WHERE id IN (843, 844, 845, 477) ORDER BY id`);
  for (const r of rows) console.log(JSON.stringify(r, null, 2));
  // 활성 캐릭 카운트
  const { rows: cnt } = await c.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE level >= 90)::int AS lv90,
            COUNT(*) FILTER (WHERE level >= 70)::int AS lv70,
            COUNT(*) FILTER (WHERE level >= 50)::int AS lv50,
            COUNT(*) FILTER (WHERE level >= 30)::int AS lv30,
            COUNT(*) FILTER (WHERE level >= 10)::int AS lv10
       FROM characters`
  );
  console.log('---ACTIVE CHARS---');
  console.log(cnt[0]);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
