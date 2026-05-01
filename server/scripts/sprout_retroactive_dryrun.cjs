// 어제(KST)부터 생성된 캐릭터 대상 차원새싹상자 소급 지급 미리보기
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
const BOX_LEVELS = [1, 10, 30, 50, 70, 90];
const BOX_ITEM_IDS = { 1: 846, 10: 847, 30: 848, 50: 849, 70: 850, 90: 851 };
(async () => {
  await c.connect();
  const { rows } = await c.query(
    `SELECT id, name, level, sprout_boxes_sent
       FROM characters
      WHERE created_at >= ((CURRENT_DATE AT TIME ZONE 'Asia/Seoul') - INTERVAL '1 day')
      ORDER BY level DESC, id ASC`
  );
  let totalBoxes = 0;
  const perLevelCount = { 1: 0, 10: 0, 30: 0, 50: 0, 70: 0, 90: 0 };
  for (const r of rows) {
    const already = new Set(r.sprout_boxes_sent || []);
    const eligible = BOX_LEVELS.filter(lv => r.level >= lv && !already.has(lv));
    totalBoxes += eligible.length;
    for (const lv of eligible) perLevelCount[lv]++;
  }
  console.log(`대상 캐릭터: ${rows.length}명`);
  console.log(`총 발송할 상자: ${totalBoxes}개`);
  for (const lv of BOX_LEVELS) console.log(`  Lv.${lv} 상자: ${perLevelCount[lv]}개`);
  console.log('---');
  // 상위 5명 상세
  console.log('Top 5 (레벨 높은 순):');
  for (const r of rows.slice(0, 5)) {
    const already = new Set(r.sprout_boxes_sent || []);
    const eligible = BOX_LEVELS.filter(lv => r.level >= lv && !already.has(lv));
    console.log(`  ${r.name} Lv.${r.level} → [${eligible.join(', ')}] (${eligible.length}개)`);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
