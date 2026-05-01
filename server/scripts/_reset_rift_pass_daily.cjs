const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const before = await c.query(`SELECT COUNT(*)::int AS n FROM characters WHERE COALESCE(pass_shop_daily_count, 0) > 0`);
  console.log('reset 대상 캐릭:', before.rows[0].n);
  const r = await c.query(`UPDATE characters SET pass_shop_daily_count = 0, pass_shop_daily_date = NULL`);
  console.log('updated:', r.rowCount);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
