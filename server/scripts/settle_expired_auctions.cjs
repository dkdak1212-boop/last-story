const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // 만료된 미정산 경매 → settled=TRUE로 전환 + 우편 발송
  const r = await pool.query(`
    SELECT id, seller_id, item_id, item_quantity,
           enhance_level, prefix_ids, prefix_stats, COALESCE(quality, 0) AS quality
    FROM auctions
    WHERE settled = FALSE AND cancelled = FALSE AND ends_at <= NOW()
  `);
  console.log(`만료 미정산 경매 ${r.rows.length}개`);

  for (const a of r.rows) {
    // 아이템 반환 우편
    await pool.query(
      `INSERT INTO mailbox (character_id, subject, body, item_id, item_quantity, gold,
                           enhance_level, prefix_ids, prefix_stats, quality)
       VALUES ($1, '거래소 만료 반환', '판매되지 않은 아이템을 반환합니다.', $2, $3, 0, $4, $5, $6::jsonb, $7)`,
      [a.seller_id, a.item_id, a.item_quantity,
       a.enhance_level || null,
       a.prefix_ids && a.prefix_ids.length > 0 ? a.prefix_ids : null,
       a.prefix_stats ? JSON.stringify(a.prefix_stats) : null,
       a.quality || null]
    );
    await pool.query('UPDATE auctions SET settled = TRUE WHERE id = $1', [a.id]);
  }
  console.log(`${r.rows.length}개 정산 + 우편 반환 완료`);

  // 현재 활성 등록 상태 확인
  const cnt = await pool.query(`
    SELECT c.user_id, u.username, COUNT(*) AS cnt
    FROM auctions a JOIN characters c ON c.id = a.seller_id JOIN users u ON u.id = c.user_id
    WHERE a.settled = FALSE AND a.cancelled = FALSE AND a.ends_at > NOW()
    GROUP BY c.user_id, u.username HAVING COUNT(*) > 5
    ORDER BY cnt DESC
  `);
  console.log(`\n5개 초과 활성 유저 ${cnt.rows.length}명:`);
  for (const row of cnt.rows) console.log(`  ${row.username}: ${row.cnt}개`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
