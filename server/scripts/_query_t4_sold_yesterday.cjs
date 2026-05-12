// 어제(KST) 거래소에서 T4 접두사 붙은 아이템을 판 유저 목록 + 갯수
// settled_at 컬럼이 없어서 mailbox.created_at(판매 완료 메일 생성 시각) 을 sold-time 프록시로 사용.
// 매칭: mailbox(seller_id, gold) ↔ auctions(seller_id, floor(buyout_price * 0.9))
const { Client } = require('pg');

const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const sql = `
      WITH window_kst AS (
        SELECT
          ((NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '1 day') AT TIME ZONE 'Asia/Seoul' AS start_utc,
          ((NOW() AT TIME ZONE 'Asia/Seoul')::date)              AT TIME ZONE 'Asia/Seoul' AS end_utc
      ),
      sold_mails AS (
        SELECT m.character_id AS seller_id, m.gold, m.created_at, m.subject
        FROM mailbox m, window_kst w
        WHERE m.subject LIKE '판매 완료:%'
          AND m.created_at >= w.start_utc
          AND m.created_at <  w.end_utc
      ),
      t4_sold AS (
        SELECT DISTINCT a.id AS auction_id, a.seller_id, a.buyout_price, sm.created_at, sm.subject
        FROM auctions a
        JOIN sold_mails sm
          ON sm.seller_id = a.seller_id
         AND sm.gold = FLOOR(a.buyout_price * 0.9)
        WHERE a.settled = TRUE
          AND EXISTS (
            SELECT 1 FROM item_prefixes p
            WHERE p.id = ANY(a.prefix_ids) AND p.tier = 4
          )
      )
      SELECT
        c.id AS seller_id,
        c.name AS seller_name,
        c.class_name,
        COUNT(*) AS t4_sold_count,
        SUM(t.buyout_price) AS total_gross_gold
      FROM t4_sold t
      JOIN characters c ON c.id = t.seller_id
      GROUP BY c.id, c.name, c.class_name
      ORDER BY t4_sold_count DESC, total_gross_gold DESC
    `;
    const r = await c.query(sql);

    if (r.rows.length === 0) {
      console.log('어제(KST) T4 접두사 판매 내역 없음.');
      return;
    }
    console.log(`어제(KST) T4 접두사 판매 — ${r.rows.length} 명`);
    console.log('seller_id | seller_name | class | T4 갯수 | 총 매출(G)');
    console.log('-'.repeat(70));
    let totalCount = 0, totalGold = 0;
    for (const row of r.rows) {
      const gold = Number(row.total_gross_gold) || 0;
      totalCount += Number(row.t4_sold_count);
      totalGold += gold;
      console.log(`${row.seller_id} | ${row.seller_name} | ${row.class_name} | ${row.t4_sold_count} | ${gold.toLocaleString()}`);
    }
    console.log('-'.repeat(70));
    console.log(`합계: ${totalCount}건, ${totalGold.toLocaleString()}G`);
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
