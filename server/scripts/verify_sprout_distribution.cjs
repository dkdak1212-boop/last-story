const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const { rows } = await c.query(
    `SELECT item_id, COUNT(*)::int AS n
       FROM mailbox
      WHERE item_id BETWEEN 846 AND 851
        AND created_at > NOW() - INTERVAL '5 minutes'
      GROUP BY item_id ORDER BY item_id`
  );
  console.log('방금 발송된 상자 분포:');
  for (const r of rows) console.log(`  item_id=${r.item_id}: ${r.n}건`);
  // 상어 케이스 확인
  const { rows: sangeo } = await c.query(
    `SELECT sprout_boxes_sent FROM characters WHERE name = $1`, ['상어']
  );
  console.log(`\n상어 sprout_boxes_sent: ${JSON.stringify(sangeo[0]?.sprout_boxes_sent)}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
