// 접두사 수치 재굴림권 (item 322) 자정 처리
//  1) shop_entries.buy_price 1 → 10,000,000 골드
//  2) 전 유저 인벤토리에서 전량 회수 (character_inventory DELETE)
//  3) auctions / mailbox 도 같이 회수 (있으면) — 추가 검토 후 처리
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
const ITEM_ID = 322;
const NEW_PRICE = 10_000_000;

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    // 사전 통계
    const beforeShop = await c.query('SELECT buy_price FROM shop_entries WHERE item_id = $1', [ITEM_ID]);
    const beforeInv = await c.query(
      'SELECT COUNT(DISTINCT character_id)::int AS chars, COUNT(*)::int AS slots, COALESCE(SUM(quantity),0)::bigint AS total FROM character_inventory WHERE item_id = $1',
      [ITEM_ID]
    );
    const beforeAuc = await c.query(
      'SELECT COUNT(*)::int AS n, COALESCE(SUM(quantity),0)::bigint AS total FROM auctions WHERE item_id = $1 AND status = $2',
      [ITEM_ID, 'listed']
    ).catch(() => ({ rows: [{ n: 0, total: 0 }] }));
    const beforeMail = await c.query(
      "SELECT COUNT(*)::int AS n, COALESCE(SUM(quantity),0)::bigint AS total FROM mailbox WHERE item_id = $1 AND received_at IS NULL",
      [ITEM_ID]
    ).catch(() => ({ rows: [{ n: 0, total: 0 }] }));

    console.log('=== BEFORE ===');
    console.log(' shop_entries buy_price:', beforeShop.rows[0]?.buy_price);
    console.log(' 인벤 보유 캐릭/슬롯/합계:', beforeInv.rows[0]);
    console.log(' 거래소 listed:', beforeAuc.rows[0]);
    console.log(' 우편 미수령:', beforeMail.rows[0]);

    await c.query('BEGIN');
    try {
      // 1) 상점 가격 변경
      const ps = await c.query(
        'UPDATE shop_entries SET buy_price = $1 WHERE item_id = $2',
        [NEW_PRICE, ITEM_ID]
      );
      console.log(`[1/2] shop_entries 가격 갱신: ${ps.rowCount} 행 → ${NEW_PRICE.toLocaleString()} 골드`);

      // 2) 인벤토리 전량 회수
      const pi = await c.query('DELETE FROM character_inventory WHERE item_id = $1', [ITEM_ID]);
      console.log(`[2/2] character_inventory 회수: ${pi.rowCount} 슬롯 삭제`);

      // 거래소 등록분도 회수 (취소 처리)
      try {
        const pa = await c.query(
          "UPDATE auctions SET status = 'expired' WHERE item_id = $1 AND status = 'listed'",
          [ITEM_ID]
        );
        if (pa.rowCount > 0) console.log(`[+] 거래소 listed → expired: ${pa.rowCount}건`);
      } catch (e) { console.log('[skip] 거래소 처리 실패:', e.message); }

      // 우편 미수령분도 회수
      try {
        const pm = await c.query(
          "UPDATE mailbox SET item_id = NULL, quantity = 0 WHERE item_id = $1 AND received_at IS NULL",
          [ITEM_ID]
        );
        if (pm.rowCount > 0) console.log(`[+] 우편 미수령 정리: ${pm.rowCount}건`);
      } catch (e) { console.log('[skip] 우편 처리 실패:', e.message); }

      await c.query('COMMIT');
      console.log('=== COMMIT 완료 ===');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }

    // 사후 통계
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
