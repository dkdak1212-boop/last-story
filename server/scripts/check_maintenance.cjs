const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  // 점검 모드 체크
  try {
    const r = await c.query(`SELECT key, value FROM server_settings WHERE key IN ('maintenance_mode','maintenance_message')`);
    console.log('server_settings:', r.rows);
  } catch (e) { console.log('server_settings 조회 실패:', e.message); }
  // 현재 채팅 가능한 유저 샘플 확인 - 가장 최근 접속 5명
  const { rows } = await c.query(
    `SELECT id, username, is_admin, COALESCE(chat_hidden,FALSE) AS chat_hidden, last_login_at
       FROM users
      WHERE last_login_at > NOW() - INTERVAL '30 minutes'
      ORDER BY last_login_at DESC LIMIT 10`
  );
  console.log('\n최근 30분 내 접속한 유저:');
  for (const r of rows) console.log(`  ${r.username} (id=${r.id}) admin=${r.is_admin} hidden=${r.chat_hidden} at=${r.last_login_at}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
