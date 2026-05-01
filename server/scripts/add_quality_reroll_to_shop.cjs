const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  // 기존 등록 여부 확인
  const { rows: existing } = await c.query('SELECT item_id, buy_price FROM shop_entries WHERE item_id = 476');
  if (existing.length > 0) {
    console.log(`기존 등록: item_id=476 buy_price=${existing[0].buy_price}`);
    await c.query('UPDATE shop_entries SET buy_price = 100000000 WHERE item_id = 476');
    console.log('가격 갱신: 100,000,000');
  } else {
    await c.query('INSERT INTO shop_entries (item_id, buy_price) VALUES (476, 100000000)');
    console.log('신규 등록: item_id=476, buy_price=100,000,000');
  }
  // 검증
  const { rows: final } = await c.query(
    `SELECT i.id, i.name, s.buy_price FROM shop_entries s JOIN items i ON i.id = s.item_id WHERE s.item_id = 476`
  );
  for (const r of final) console.log(`${r.id} | ${r.name} | ${r.buy_price.toLocaleString()}G`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
