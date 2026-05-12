// 자전거래 / 어뷰징 의심 닉네임 조회
// 패턴 1: 거래소에서 본인 계정의 다른 캐릭이 낙찰 (seller.user_id == bidder.user_id)
// 패턴 2: 메일로 본인 계정의 다른 캐릭에게 아이템 송부 (sender.user_id == recipient.user_id)
// 패턴 3: 인보이스 거래 (현재 시점 기준 최근 30일)
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    // 패턴 1: 거래소 자전거래 — settled=TRUE 이고 seller.user_id == current_bidder.user_id
    console.log('=== 패턴 1: 거래소 자전거래 (seller user_id == bidder user_id, 최근 30일) ===');
    const r1 = await c.query(`
      SELECT
        u.username,
        sc.id AS seller_char_id, sc.name AS seller_name, sc.class_name AS seller_class,
        bc.id AS buyer_char_id, bc.name AS buyer_name, bc.class_name AS buyer_class,
        COUNT(*) AS deals,
        SUM(a.buyout_price)::bigint AS total_gold,
        MAX(a.created_at) AS last_at
      FROM auctions a
      JOIN characters sc ON sc.id = a.seller_id
      JOIN characters bc ON bc.id = a.current_bidder_id
      JOIN users u ON u.id = sc.user_id AND u.id = bc.user_id
      WHERE a.settled = TRUE
        AND a.current_bidder_id IS NOT NULL
        AND sc.user_id = bc.user_id
        AND sc.id <> bc.id
        AND a.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY u.username, sc.id, sc.name, sc.class_name, bc.id, bc.name, bc.class_name
      ORDER BY deals DESC, total_gold DESC
      LIMIT 50
    `);
    if (r1.rowCount === 0) console.log('(없음)');
    else for (const r of r1.rows) {
      const gold = Number(r.total_gold) || 0;
      console.log(`${r.username} | ${r.seller_name}(${r.seller_class}) → ${r.buyer_name}(${r.buyer_class}) | ${r.deals}건 | ${gold.toLocaleString()}G | 최근 ${r.last_at.toISOString().slice(0,10)}`);
    }

    // 패턴 2: 메일로 자전 송부 — sender_character_id != character_id 이고 같은 user_id, item_id 있음
    console.log('\n=== 패턴 2: 메일로 본인 계정 송부 (item 첨부, 최근 30일) ===');
    const r2 = await c.query(`
      SELECT
        u.username,
        sc.id AS sender_char_id, sc.name AS sender_name, sc.class_name AS sender_class,
        rc.id AS recipient_char_id, rc.name AS recipient_name, rc.class_name AS recipient_class,
        COUNT(*) AS mails,
        SUM(m.item_quantity)::int AS total_qty,
        SUM(m.gold)::bigint AS total_gold,
        MAX(m.created_at) AS last_at
      FROM mailbox m
      JOIN characters sc ON sc.id = m.sender_character_id
      JOIN characters rc ON rc.id = m.character_id
      JOIN users u ON u.id = sc.user_id AND u.id = rc.user_id
      WHERE m.sender_character_id IS NOT NULL
        AND m.sender_character_id <> m.character_id
        AND sc.user_id = rc.user_id
        AND m.created_at >= NOW() - INTERVAL '30 days'
        AND (m.item_id IS NOT NULL OR m.gold > 0)
      GROUP BY u.username, sc.id, sc.name, sc.class_name, rc.id, rc.name, rc.class_name
      ORDER BY mails DESC, total_gold DESC
      LIMIT 50
    `);
    if (r2.rowCount === 0) console.log('(없음)');
    else for (const r of r2.rows) {
      const gold = Number(r.total_gold) || 0;
      console.log(`${r.username} | ${r.sender_name}(${r.sender_class}) → ${r.recipient_name}(${r.recipient_class}) | mail ${r.mails}건 | qty ${r.total_qty || 0} | ${gold.toLocaleString()}G | 최근 ${r.last_at.toISOString().slice(0,10)}`);
    }

    // 패턴 3: 한 user 내 자전거래 합계 (top abusers)
    console.log('\n=== 패턴 3: 계정 단위 자전거래 합계 (거래소+메일 통합, 최근 30일) ===');
    const r3 = await c.query(`
      WITH ah AS (
        SELECT sc.user_id AS uid, COUNT(*) AS cnt, SUM(a.buyout_price)::bigint AS gold
        FROM auctions a
        JOIN characters sc ON sc.id = a.seller_id
        JOIN characters bc ON bc.id = a.current_bidder_id
        WHERE a.settled = TRUE
          AND sc.user_id = bc.user_id AND sc.id <> bc.id
          AND a.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY sc.user_id
      ),
      mh AS (
        SELECT sc.user_id AS uid, COUNT(*) AS cnt, SUM(m.gold)::bigint AS gold
        FROM mailbox m
        JOIN characters sc ON sc.id = m.sender_character_id
        JOIN characters rc ON rc.id = m.character_id
        WHERE m.sender_character_id IS NOT NULL AND m.sender_character_id <> m.character_id
          AND sc.user_id = rc.user_id
          AND m.created_at >= NOW() - INTERVAL '30 days'
          AND (m.item_id IS NOT NULL OR m.gold > 0)
        GROUP BY sc.user_id
      )
      SELECT
        u.username,
        COALESCE(ah.cnt, 0) AS auction_cnt,
        COALESCE(ah.gold, 0)::bigint AS auction_gold,
        COALESCE(mh.cnt, 0) AS mail_cnt,
        COALESCE(mh.gold, 0)::bigint AS mail_gold,
        (COALESCE(ah.gold, 0) + COALESCE(mh.gold, 0))::bigint AS total_gold
      FROM users u
      LEFT JOIN ah ON ah.uid = u.id
      LEFT JOIN mh ON mh.uid = u.id
      WHERE COALESCE(ah.cnt, 0) + COALESCE(mh.cnt, 0) > 0
      ORDER BY total_gold DESC
      LIMIT 30
    `);
    if (r3.rowCount === 0) console.log('(없음)');
    else {
      console.log('username | auction(건) | auction(G) | mail(건) | mail(G) | total(G)');
      for (const r of r3.rows) {
        console.log(`${r.username} | ${r.auction_cnt} | ${Number(r.auction_gold).toLocaleString()} | ${r.mail_cnt} | ${Number(r.mail_gold).toLocaleString()} | ${Number(r.total_gold).toLocaleString()}`);
      }
    }
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
