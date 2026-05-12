const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const r = await c.query(`SELECT id, name, stack_size FROM items WHERE id IN (100, 102, 104, 106, 108) ORDER BY id`);
  for (const row of r.rows) console.log(row);
  // 흩어진 카운트
  const dup = await c.query(`SELECT character_id, item_id, COUNT(*)::int AS slots, SUM(quantity)::int AS total FROM character_inventory WHERE item_id IN (100, 102, 104, 106, 108) GROUP BY character_id, item_id HAVING COUNT(*) > 1 ORDER BY slots DESC LIMIT 5`);
  console.log('흩어진 그룹 샘플 (slot>1):', dup.rows);
  const total = await c.query(`SELECT COUNT(*)::int AS groups FROM (SELECT character_id, item_id FROM character_inventory WHERE item_id IN (100, 102, 104, 106, 108) GROUP BY character_id, item_id HAVING COUNT(*) > 1) sub`);
  console.log('합칠 그룹 총수:', total.rows[0].groups);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
