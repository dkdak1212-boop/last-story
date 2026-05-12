const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const ids = [840, 911];
  const inv = await c.query(`SELECT item_id, COALESCE(SUM(quantity),0)::int AS q FROM character_inventory WHERE character_id=33 AND item_id = ANY($1) GROUP BY item_id`, [ids]);
  console.log('=== 인벤 보유 ===');
  if (inv.rowCount === 0) console.log('(없음)');
  for (const r of inv.rows) console.log(`item ${r.item_id}: ${r.q}`);

  const mb = await c.query(`SELECT item_id, COUNT(*)::int AS n, COALESCE(SUM(item_quantity),0)::int AS q FROM mailbox WHERE character_id=33 AND item_id = ANY($1) GROUP BY item_id`, [ids]);
  console.log('\n=== 우편함 미수령 ===');
  if (mb.rowCount === 0) console.log('(없음)');
  for (const r of mb.rows) console.log(`item ${r.item_id}: ${r.q} 장 (${r.n}건)`);

  const received = await c.query(`SELECT subject, item_id, item_quantity, created_at FROM mailbox WHERE character_id=33 AND item_id = ANY($1) ORDER BY created_at DESC LIMIT 30`, [ids]);
  console.log('\n=== 미수령 mail 상세 ===');
  if (received.rowCount === 0) console.log('(없음)');
  for (const r of received.rows) console.log(`[${r.created_at}] item${r.item_id} qty=${r.item_quantity} : ${r.subject}`);

  // 창고 (storage) 도 확인
  const stoR = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='character_storage' OR table_name='storage' OR table_name='guild_storage'`);
  console.log('\n=== storage 테이블 후보 ===');
  for (const r of stoR.rows) console.log(r.column_name);

  await c.end();
})().catch(e => console.error(e));
