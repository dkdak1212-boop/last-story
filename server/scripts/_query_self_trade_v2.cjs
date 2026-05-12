// 자전거래 의심 v2 — 간접 시그널 기반
// 패턴 A: 등록 직후 매우 빠르게 (10분 내) settled 된 매물 + 같은 user 가 다중 캐릭 보유
// 패턴 B: 같은 user 다중 캐릭 (3+) + 거래소 매물량 많음 + 같은 가격대 패턴
// 패턴 C: 한 캐릭이 짧은 시간 (1주) 안 골드 폭증 (현재 보유 + 누적 - 이론치)
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    // 패턴 A: 등록 후 매우 빠르게 (≤10분) settled 매물 + 다중 캐릭 user
    console.log('=== 패턴 A: 등록 후 ≤10분 settled (자전 의심), 같은 user 가 2+ 캐릭 보유 (최근 30일) ===');
    const rA = await c.query(`
      WITH fast_settle AS (
        SELECT a.seller_id, a.id AS auction_id, a.buyout_price, a.created_at,
               m.created_at AS mail_at,
               EXTRACT(EPOCH FROM (m.created_at - a.created_at)) AS settle_sec
          FROM auctions a
          JOIN mailbox m
            ON m.character_id = a.seller_id
           AND m.subject LIKE '판매 완료:%'
           AND m.gold = FLOOR(a.buyout_price * 0.9)
           AND m.created_at BETWEEN a.created_at AND a.created_at + INTERVAL '10 minutes'
         WHERE a.settled = TRUE
           AND a.created_at >= NOW() - INTERVAL '30 days'
      )
      SELECT u.username, u.id AS user_id,
             COUNT(DISTINCT c.id) AS char_count,
             COUNT(*) AS fast_deals,
             SUM(fs.buyout_price)::bigint AS total_gold,
             ROUND(AVG(fs.settle_sec)::numeric, 0) AS avg_settle_sec,
             MIN(fs.settle_sec)::int AS min_sec
        FROM fast_settle fs
        JOIN characters c ON c.id = fs.seller_id
        JOIN users u ON u.id = c.user_id
        JOIN characters c2 ON c2.user_id = u.id
       GROUP BY u.username, u.id
      HAVING COUNT(DISTINCT c2.id) >= 2 AND COUNT(*) >= 3
       ORDER BY total_gold DESC
       LIMIT 30
    `);
    if (rA.rowCount === 0) console.log('(없음)');
    else {
      console.log('username | 계정 캐릭수 | 빠른판매 건수 | 평균 정산 sec | 최소 sec | 총 매출(G)');
      for (const r of rA.rows) {
        console.log(`${r.username} | ${r.char_count} | ${r.fast_deals} | ${r.avg_settle_sec}s | ${r.min_sec}s | ${Number(r.total_gold).toLocaleString()}`);
      }
    }

    // 패턴 B: 같은 user 가 동일 매물 가격으로 다수 등록 → 자전 가능성
    console.log('\n=== 패턴 B: 같은 user 가 같은 buyout_price 로 다수 등록 (5+ 매물) — 자전/시세조작 의심 (최근 30일) ===');
    const rB = await c.query(`
      SELECT u.username, a.buyout_price, COUNT(*) AS listings,
             SUM(CASE WHEN a.settled = TRUE THEN 1 ELSE 0 END) AS settled_n,
             COUNT(DISTINCT a.seller_id) AS distinct_chars
        FROM auctions a
        JOIN characters c ON c.id = a.seller_id
        JOIN users u ON u.id = c.user_id
       WHERE a.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY u.username, a.buyout_price
      HAVING COUNT(*) >= 5 AND COUNT(DISTINCT a.seller_id) >= 2
       ORDER BY listings DESC
       LIMIT 30
    `);
    if (rB.rowCount === 0) console.log('(없음)');
    else {
      console.log('username | 가격(G) | 등록건수 | settled | 다른 캐릭 수');
      for (const r of rB.rows) {
        console.log(`${r.username} | ${Number(r.buyout_price).toLocaleString()} | ${r.listings} | ${r.settled_n} | ${r.distinct_chars}`);
      }
    }

    // 패턴 C: 단기간 내 (24시간) 매물 등록 + settled 가 매우 빈번한 user (자전 의심)
    console.log('\n=== 패턴 C: 24시간 내 settled 매물 폭발 (10+) ===');
    const rC = await c.query(`
      SELECT u.username, COUNT(DISTINCT c.id) AS chars,
             COUNT(*) AS settled_24h,
             SUM(a.buyout_price)::bigint AS total_gold
        FROM auctions a
        JOIN characters c ON c.id = a.seller_id
        JOIN users u ON u.id = c.user_id
       WHERE a.settled = TRUE
         AND a.created_at >= NOW() - INTERVAL '24 hours'
       GROUP BY u.username
      HAVING COUNT(*) >= 10
       ORDER BY total_gold DESC
       LIMIT 30
    `);
    if (rC.rowCount === 0) console.log('(없음)');
    else {
      console.log('username | 캐릭수 | 24h settled | 총 매출(G)');
      for (const r of rC.rows) {
        console.log(`${r.username} | ${r.chars} | ${r.settled_24h} | ${Number(r.total_gold).toLocaleString()}`);
      }
    }

    // 패턴 D: 같은 가격으로 같은 시간대(±5분)에 등록한 같은 user 의 다중 매물 (자전 cluster)
    console.log('\n=== 패턴 D: 같은 user 다중 캐릭이 ±5분 내 동일 buyout_price 로 동시 등록 (의심 cluster) ===');
    const rD = await c.query(`
      SELECT u.username, a.buyout_price,
             date_trunc('minute', a.created_at) AS bucket,
             COUNT(*) AS listings,
             COUNT(DISTINCT a.seller_id) AS chars,
             STRING_AGG(DISTINCT c.name, ', ') AS char_names
        FROM auctions a
        JOIN characters c ON c.id = a.seller_id
        JOIN users u ON u.id = c.user_id
       WHERE a.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY u.username, a.buyout_price, bucket
      HAVING COUNT(DISTINCT a.seller_id) >= 2 AND COUNT(*) >= 2
       ORDER BY listings DESC, bucket DESC
       LIMIT 30
    `);
    if (rD.rowCount === 0) console.log('(없음)');
    else {
      console.log('username | 시간 | 가격 | 등록건수 | 캐릭 (이름)');
      for (const r of rD.rows) {
        console.log(`${r.username} | ${r.bucket.toISOString().slice(0,16)} | ${Number(r.buyout_price).toLocaleString()}G | ${r.listings} | ${r.char_names}`);
      }
    }
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
