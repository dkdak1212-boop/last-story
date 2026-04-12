const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const USERNAME = 'well12';
const NEW_PASSWORD = 'dldirl123';

(async () => {
  const u = await pool.query('SELECT id, username, banned, ban_reason FROM users WHERE username = $1', [USERNAME]);
  if (u.rowCount === 0) {
    console.error(`사용자 ${USERNAME} 없음`);
    process.exit(1);
  }
  console.log(`대상: ${JSON.stringify(u.rows[0])}`);

  const hash = await bcrypt.hash(NEW_PASSWORD, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, u.rows[0].id]);

  const v = await pool.query('SELECT password_hash FROM users WHERE id = $1', [u.rows[0].id]);
  const ok = await bcrypt.compare(NEW_PASSWORD, v.rows[0].password_hash);
  console.log(`검증: bcrypt.compare = ${ok}`);
  if (!ok) { console.error('🚨 검증 실패'); process.exit(1); }
  console.log('완료');
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
