const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const MAX_LISTINGS = 10;

(async () => {
  // 계정별 활성 등록 10개 초과인 유저 조회
  const overR = await pool.query(`
    SELECT c.user_id, u.username, COUNT(*) AS cnt
    FROM auctions a
    JOIN characters c ON c.id = a.seller_id
    JOIN users u ON u.id = c.user_id
    WHERE a.settled = FALSE AND a.cancelled = FALSE AND a.ends_at > NOW()
    GROUP BY c.user_id, u.username
    HAVING COUNT(*) > ${MAX_LISTINGS}
    ORDER BY cnt DESC
  `);
  console.log(`10개 초과 유저 ${overR.rows.length}명\n`);

  let totalCancelled = 0;

  for (const user of overR.rows) {
    // 해당 유저의 활성 경매를 최신순으로 조회
    const aR = await pool.query(`
      SELECT a.id, a.seller_id, a.item_id, a.item_quantity, a.created_at,
             a.enhance_level, a.prefix_ids, a.prefix_stats, COALESCE(a.quality, 0) AS quality,
             i.name AS item_name
      FROM auctions a
      JOIN characters c ON c.id = a.seller_id
      JOIN items i ON i.id = a.item_id
      WHERE c.user_id = $1 AND a.settled = FALSE AND a.cancelled = FALSE AND a.ends_at > NOW()
      ORDER BY a.created_at DESC
    `, [user.user_id]);

    const keep = aR.rows.slice(0, MAX_LISTINGS);  // 최신 10개 유지
    const remove = aR.rows.slice(MAX_LISTINGS);     // 나머지 삭제 (우편 반환)

    console.log(`[${user.username}] 활성 ${user.cnt}개 → ${keep.length}개 유지, ${remove.length}개 반환`);

    for (const a of remove) {
      // 우편으로 아이템 반환
      await pool.query(
        `INSERT INTO mailbox (character_id, subject, body, item_id, item_quantity, gold,
                             enhance_level, prefix_ids, prefix_stats, quality)
         VALUES ($1, '거래소 정리 반환', '등록 한도(10개) 초과로 오래된 매물을 반환합니다.', $2, $3, 0, $4, $5, $6::jsonb, $7)`,
        [a.seller_id, a.item_id, a.item_quantity,
         a.enhance_level || null,
         a.prefix_ids && a.prefix_ids.length > 0 ? a.prefix_ids : null,
         a.prefix_stats ? JSON.stringify(a.prefix_stats) : null,
         a.quality || null]
      );
      // cancelled 처리
      await pool.query('UPDATE auctions SET cancelled = TRUE WHERE id = $1', [a.id]);
      totalCancelled++;
    }
  }

  console.log(`\n총 ${totalCancelled}개 매물 반환 완료`);

  // 결과 확인
  const afterR = await pool.query(`
    SELECT c.user_id, u.username, COUNT(*) AS cnt
    FROM auctions a
    JOIN characters c ON c.id = a.seller_id
    JOIN users u ON u.id = c.user_id
    WHERE a.settled = FALSE AND a.cancelled = FALSE AND a.ends_at > NOW()
    GROUP BY c.user_id, u.username
    HAVING COUNT(*) > ${MAX_LISTINGS}
    ORDER BY cnt DESC
  `);
  console.log(`\n정리 후 10개 초과 유저: ${afterR.rows.length}명`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
