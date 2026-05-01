// 어제(KST)부터 생성된 캐릭터 대상 차원새싹상자 소급 지급 실행
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
      ORDER BY id ASC`
  );
  let totalMailed = 0;
  let totalCharsUpdated = 0;
  for (const r of rows) {
    const already = new Set(r.sprout_boxes_sent || []);
    const eligible = BOX_LEVELS.filter(lv => r.level >= lv && !already.has(lv));
    if (eligible.length === 0) continue;
    for (const lv of eligible) {
      const itemId = BOX_ITEM_IDS[lv];
      await c.query(
        `INSERT INTO mailbox (character_id, subject, body, item_id, item_quantity, gold)
         VALUES ($1, $2, $3, $4, 1, 0)`,
        [r.id, `차원새싹상자 (Lv.${lv})`, `[소급 지급] Lv.${lv} 달성 축하 — 차원새싹상자를 수령하고 인벤토리에서 개봉하세요. (상자·내용물 모두 계정 귀속)`, itemId]
      );
      totalMailed++;
    }
    // sprout_boxes_sent 갱신 — 기존 + eligible 병합
    const merged = Array.from(new Set([...Array.from(already), ...eligible])).sort((a,b) => a-b);
    await c.query('UPDATE characters SET sprout_boxes_sent = $1 WHERE id = $2', [merged, r.id]);
    totalCharsUpdated++;
  }
  console.log(`발송 우편: ${totalMailed}건`);
  console.log(`갱신 캐릭: ${totalCharsUpdated}명`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
