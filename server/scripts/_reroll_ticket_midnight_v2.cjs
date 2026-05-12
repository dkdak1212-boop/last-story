// 접두사 수치 재굴림권 (item 322) 자정 처리 v2 — 거래소/우편 분기 제거
//  1) shop_entries.buy_price 1 → 10,000,000 골드
//  2) 전 유저 인벤토리에서 전량 회수 (character_inventory DELETE)
// v1 의 거래소 status 컬럼 오류로 transaction aborted 됐던 문제 수정 — 핵심 2개만 단순 실행.
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
const ITEM_ID = 322;
const NEW_PRICE = 10_000_000;

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const beforeShop = await c.query('SELECT buy_price FROM shop_entries WHERE item_id = $1', [ITEM_ID]);
    const beforeInv = await c.query(
      'SELECT COUNT(DISTINCT character_id)::int AS chars, COUNT(*)::int AS slots, COALESCE(SUM(quantity),0)::bigint AS total FROM character_inventory WHERE item_id = $1',
      [ITEM_ID]
    );
    console.log('=== BEFORE ===');
    console.log(' shop_entries buy_price:', beforeShop.rows[0]?.buy_price);
    console.log(' 인벤 보유:', beforeInv.rows[0]);

    await c.query('BEGIN');
    try {
      const ps = await c.query(
        'UPDATE shop_entries SET buy_price = $1 WHERE item_id = $2',
        [NEW_PRICE, ITEM_ID]
      );
      console.log(`[1/2] shop_entries buy_price = ${NEW_PRICE.toLocaleString()} (${ps.rowCount} 행)`);

      const pi = await c.query('DELETE FROM character_inventory WHERE item_id = $1', [ITEM_ID]);
      console.log(`[2/2] character_inventory DELETE: ${pi.rowCount} 슬롯`);

      await c.query('COMMIT');
      console.log('=== COMMIT 완료 ===');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }

    const afterShop = await c.query('SELECT buy_price FROM shop_entries WHERE item_id = $1', [ITEM_ID]);
    const afterInv = await c.query(
      'SELECT COUNT(*)::int AS slots, COALESCE(SUM(quantity),0)::bigint AS total FROM character_inventory WHERE item_id = $1',
      [ITEM_ID]
    );
    console.log('=== AFTER ===');
    console.log(' shop_entries buy_price:', afterShop.rows[0]?.buy_price);
    console.log(' 인벤 잔여:', afterInv.rows[0]);
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
