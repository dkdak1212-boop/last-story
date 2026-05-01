const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  // 관리자 상태
  const { rows: adm } = await c.query(`SELECT id, username, is_admin, COALESCE(chat_hidden,FALSE) AS chat_hidden FROM users WHERE is_admin = TRUE`);
  console.log('관리자 계정:');
  for (const r of adm) console.log(`  ${r.username} (id=${r.id}) is_admin=${r.is_admin} chat_hidden=${r.chat_hidden}`);
  // 최근 채팅 로그
  const { rows: chats } = await c.query(
    `SELECT channel, from_name, text, created_at FROM chat_messages ORDER BY created_at DESC LIMIT 10`
  );
  console.log('\n최근 채팅 10개:');
  for (const r of chats) console.log(`  [${r.channel}] ${r.from_name}: ${r.text.slice(0, 40)} (${r.created_at})`);
  // chat_hidden 유저 수
  const { rows: hidden } = await c.query(`SELECT COUNT(*)::int AS n FROM users WHERE COALESCE(chat_hidden,FALSE) = TRUE`);
  console.log(`\nchat_hidden = TRUE 유저 수: ${hidden[0].n}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
