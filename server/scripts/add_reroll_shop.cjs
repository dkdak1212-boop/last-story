const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const item = await pool.query(`SELECT id, name FROM items WHERE name = '접두사 재굴림권'`);
  if (item.rowCount === 0) {
    console.error('아이템 없음');
    process.exit(1);
  }
  const itemId = item.rows[0].id;
  console.log('아이템:', item.rows[0]);

  const existing = await pool.query(`SELECT * FROM shop_entries WHERE item_id = $1`, [itemId]);
  if (existing.rowCount > 0) {
    console.log('이미 등록됨 → 가격 갱신');
    await pool.query(`UPDATE shop_entries SET buy_price = 10000000, stock = -1 WHERE item_id = $1`, [itemId]);
  } else {
    await pool.query(`INSERT INTO shop_entries (item_id, buy_price, stock) VALUES ($1, 10000000, -1)`, [itemId]);
  }

  const verify = await pool.query(`SELECT * FROM shop_entries WHERE item_id = $1`, [itemId]);
  console.log('결과:', verify.rows[0]);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
