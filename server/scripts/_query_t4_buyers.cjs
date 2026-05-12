// 거래소 T4 접두사 아이템 구매횟수 + 평균가 — 최근 30일 + 전체 두 가지
// auctions.current_bidder_id 가 buyer (buyout 시 setting). settled=TRUE + prefix_ids 에 T4 포함.
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    // 빠른 sanity — current_bidder_id 가 buyout 시 채워지는지 확인
    const sanity = await c.query(`
      SELECT COUNT(*) FILTER (WHERE current_bidder_id IS NOT NULL) AS with_bidder,
             COUNT(*) FILTER (WHERE settled = TRUE) AS settled_n,
             COUNT(*) AS total
      FROM auctions
    `);
    console.log('=== auctions sanity ===');
    console.log(`총 매물: ${sanity.rows[0].total}, settled: ${sanity.rows[0].settled_n}, current_bidder_id 있음: ${sanity.rows[0].with_bidder}`);

    // 전체 기간 T4 구매 TOP 10
    console.log('\n=== T4 접두사 구매 TOP 10 (전체 기간) ===');
    const r = await c.query(`
      SELECT
        c.id AS char_id,
        c.name,
        c.class_name,
        c.level,
        COUNT(*) AS buys,
        SUM(a.buyout_price)::bigint AS total_gold,
        ROUND(AVG(a.buyout_price)::numeric)::bigint AS avg_price,
        MIN(a.buyout_price) AS min_price,
        MAX(a.buyout_price) AS max_price
      FROM auctions a
      JOIN characters c ON c.id = a.current_bidder_id
      WHERE a.settled = TRUE
        AND a.current_bidder_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM item_prefixes p
          WHERE p.id = ANY(a.prefix_ids) AND p.tier = 4
        )
      GROUP BY c.id, c.name, c.class_name, c.level
      ORDER BY buys DESC, total_gold DESC
      LIMIT 10
    `);
    if (r.rowCount === 0) {
      console.log('(없음 — current_bidder_id 가 비어있거나 T4 매물 없음)');
    } else {
      console.log('순위 | 캐릭 (클래스/Lv) | 구매 | 평균가(G) | 총 지출(G) | 최소~최대');
      console.log('-'.repeat(90));
      let i = 0;
      for (const row of r.rows) {
        i++;
        const avg = Number(row.avg_price).toLocaleString();
        const tot = Number(row.total_gold).toLocaleString();
        const min = Number(row.min_price).toLocaleString();
        const max = Number(row.max_price).toLocaleString();
        console.log(`${i} | ${row.name} (${row.class_name}/L${row.level}) | ${row.buys}회 | ${avg} | ${tot} | ${min}~${max}`);
      }
    }

    // 최근 30일 T4 구매 TOP 10
    console.log('\n=== T4 접두사 구매 TOP 10 (최근 30일) ===');
    const r2 = await c.query(`
      SELECT
        c.id AS char_id,
        c.name,
        c.class_name,
        c.level,
        COUNT(*) AS buys,
        SUM(a.buyout_price)::bigint AS total_gold,
        ROUND(AVG(a.buyout_price)::numeric)::bigint AS avg_price
      FROM auctions a
      JOIN characters c ON c.id = a.current_bidder_id
      WHERE a.settled = TRUE
        AND a.current_bidder_id IS NOT NULL
        AND a.created_at >= NOW() - INTERVAL '30 days'
        AND EXISTS (
          SELECT 1 FROM item_prefixes p
          WHERE p.id = ANY(a.prefix_ids) AND p.tier = 4
        )
      GROUP BY c.id, c.name, c.class_name, c.level
      ORDER BY buys DESC, total_gold DESC
      LIMIT 10
    `);
    if (r2.rowCount === 0) console.log('(없음)');
    else {
      console.log('순위 | 캐릭 (클래스/Lv) | 구매 | 평균가(G) | 총 지출(G)');
      console.log('-'.repeat(80));
      let i = 0;
      for (const row of r2.rows) {
        i++;
        const avg = Number(row.avg_price).toLocaleString();
        const tot = Number(row.total_gold).toLocaleString();
        console.log(`${i} | ${row.name} (${row.class_name}/L${row.level}) | ${row.buys}회 | ${avg} | ${tot}`);
      }
    }
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
