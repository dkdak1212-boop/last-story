const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // 찢어진 스크롤 ID 확인
  const item = await pool.query(`SELECT id, name FROM items WHERE id = 320`);
  console.log('아이템:', item.rows[0]);

  // shop_entries 테이블 구조 확인
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'shop_entries' ORDER BY ordinal_position`);
  console.log('shop_entries 컬럼:', cols.rows.map(r => r.column_name));

  // 기존 등록 여부 확인
  const existing = await pool.query(`SELECT * FROM shop_entries WHERE item_id = 320`);
  if (existing.rowCount > 0) {
    console.log('이미 등록됨 → 가격 갱신');
    await pool.query(`UPDATE shop_entries SET price = 100000 WHERE item_id = 320`);
  } else {
    // 샘플 행 확인 후 INSERT
    const sample = await pool.query(`SELECT * FROM shop_entries LIMIT 1`);
    console.log('샘플:', JSON.stringify(sample.rows[0]));
    await pool.query(`INSERT INTO shop_entries (item_id, price, stock) VALUES (320, 100000, -1)`);
  }

  const verify = await pool.query(`SELECT * FROM shop_entries WHERE item_id = 320`);
  console.log('결과:', JSON.stringify(verify.rows[0]));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
