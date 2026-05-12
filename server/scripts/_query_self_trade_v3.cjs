// 자전거래 의심 캐릭 — 패턴 A 의 top user 별 캐릭 이름 / 클래스 / 활동 nickname 출력
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    console.log('=== 자전거래 의심 TOP 30 (패턴 A) — 등록 후 ≤10분 settled, 같은 user 2+ 캐릭 ===\n');
    const r = await c.query(`
      WITH fast_settle AS (
        SELECT a.seller_id, a.buyout_price, a.created_at,
               EXTRACT(EPOCH FROM (m.created_at - a.created_at)) AS settle_sec
          FROM auctions a
          JOIN mailbox m
            ON m.character_id = a.seller_id
           AND m.subject LIKE '판매 완료:%'
           AND m.gold = FLOOR(a.buyout_price * 0.9)
           AND m.created_at BETWEEN a.created_at AND a.created_at + INTERVAL '10 minutes'
         WHERE a.settled = TRUE
           AND a.created_at >= NOW() - INTERVAL '30 days'
      ),
      agg AS (
        SELECT u.id AS uid, u.username,
               COUNT(*) AS deals,
               SUM(fs.buyout_price)::bigint AS total_gold,
               MIN(fs.settle_sec)::int AS min_sec
          FROM fast_settle fs
          JOIN characters c ON c.id = fs.seller_id
          JOIN users u ON u.id = c.user_id
         GROUP BY u.id, u.username
        HAVING COUNT(*) >= 5
         ORDER BY SUM(fs.buyout_price) DESC
         LIMIT 30
      )
      SELECT a.username, a.deals, a.total_gold, a.min_sec,
             STRING_AGG(c.name || '(' || c.class_name || ' L' || c.level || ')', ', ' ORDER BY c.id) AS chars
        FROM agg a
        JOIN characters c ON c.user_id = a.uid
       GROUP BY a.username, a.deals, a.total_gold, a.min_sec
       ORDER BY a.total_gold DESC
    `);
    if (r.rowCount === 0) { console.log('(없음)'); return; }
    for (const row of r.rows) {
      console.log(`★ ${row.deals}건 / ${Number(row.total_gold).toLocaleString()}G / 최소 ${row.min_sec}s`);
      console.log(`   계정 캐릭: ${row.chars}`);
      console.log('');
    }
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
