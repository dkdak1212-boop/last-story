const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  // 어제 (KST) 00:00 이후 생성된 캐릭
  const { rows } = await c.query(
    `SELECT id, name, class_name, level,
            (created_at AT TIME ZONE 'Asia/Seoul') AS created_kst
       FROM characters
      WHERE created_at >= ((CURRENT_DATE AT TIME ZONE 'Asia/Seoul') - INTERVAL '1 day')
      ORDER BY created_at ASC`
  );
  console.log(`어제 00시 이후 생성된 캐릭터: ${rows.length}명`);
  let lv1=0, lv10=0, lv30=0, lv50=0, lv70=0, lv90=0;
  for (const r of rows) {
    if (r.level >= 1) lv1++;
    if (r.level >= 10) lv10++;
    if (r.level >= 30) lv30++;
    if (r.level >= 50) lv50++;
    if (r.level >= 70) lv70++;
    if (r.level >= 90) lv90++;
    console.log(`  ${r.name} | ${r.class_name} | Lv.${r.level} | ${r.created_kst}`);
  }
  console.log(`---`);
  console.log(`Lv≥1:${lv1} ≥10:${lv10} ≥30:${lv30} ≥50:${lv50} ≥70:${lv70} ≥90:${lv90}`);
  const totalBoxes = lv1 + lv10 + lv30 + lv50 + lv70 + lv90;
  console.log(`총 지급할 상자: ${totalBoxes}개`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
