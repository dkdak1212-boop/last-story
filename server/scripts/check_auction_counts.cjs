const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // 모든 유저별 활성 등록 수
  const r = await pool.query(`
    SELECT c.user_id, u.username, COUNT(*) AS active_cnt
    FROM auctions a
    JOIN characters c ON c.id = a.seller_id
    JOIN users u ON u.id = c.user_id
    WHERE a.settled = FALSE AND a.cancelled = FALSE AND a.ends_at > NOW()
    GROUP BY c.user_id, u.username
    ORDER BY active_cnt DESC
    LIMIT 20
  `);
  console.log('유저별 활성 등록:');
  for (const row of r.rows) console.log(`  ${row.username} (user_id=${row.user_id}): ${row.active_cnt}개`);

  // admin 유저 상세
  const admin = await pool.query(`
    SELECT a.id, i.name, a.settled, a.cancelled, a.ends_at, a.created_at
    FROM auctions a
    JOIN characters c ON c.id = a.seller_id
    JOIN users u ON u.id = c.user_id
    JOIN items i ON i.id = a.item_id
    WHERE u.username = 'admin'
    ORDER BY a.created_at DESC LIMIT 20
  `);
  console.log('\nadmin 최근 등록:');
  for (const row of admin.rows) {
    const expired = new Date(row.ends_at) < new Date();
    console.log(`  #${row.id} ${row.name} | settled=${row.settled} cancelled=${row.cancelled} expired=${expired} ends=${row.ends_at}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
