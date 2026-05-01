const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  // 레벨별 장비 (slot != null) 종합
  const { rows } = await c.query(
    `SELECT COALESCE(required_level,1) AS lv, slot, grade, COUNT(*)::int AS n
       FROM items
      WHERE slot IS NOT NULL
      GROUP BY lv, slot, grade
      ORDER BY lv, slot, grade`
  );
  let curLv = -1;
  for (const r of rows) {
    if (r.lv !== curLv) { console.log(`\n--- Lv.${r.lv} ---`); curLv = r.lv; }
    console.log(`  ${r.slot} (${r.grade}): ${r.n}종`);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
