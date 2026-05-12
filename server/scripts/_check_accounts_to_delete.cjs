const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
const NAMES = ['주먹', '골드', '도쿄'];

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    for (const n of NAMES) {
      console.log(`\n━━━ '${n}' ━━━`);
      const ch = await c.query(`SELECT id, name, user_id, level, class_name, last_online_at FROM characters WHERE name = $1`, [n]);
      if (ch.rowCount === 0) { console.log('  (캐릭 없음)'); continue; }
      for (const row of ch.rows) {
        console.log(`  캐릭 #${row.id} ${row.name} (user_id=${row.user_id}, ${row.class_name} L${row.level}, last_online=${row.last_online_at})`);
        // 같은 계정의 다른 캐릭 모두 나열
        const sib = await c.query(`SELECT id, name, level, class_name FROM characters WHERE user_id = $1 ORDER BY id`, [row.user_id]);
        const others = sib.rows.filter(x => x.id !== row.id);
        if (others.length > 0) {
          console.log(`    같은 계정의 다른 캐릭 (${others.length}개): ${others.map(x => `${x.name}(L${x.level} ${x.class_name})`).join(', ')}`);
        }
        // 계정 정보
        const u = await c.query(`SELECT id, username, created_at, is_admin FROM users WHERE id = $1`, [row.user_id]);
        if (u.rowCount > 0) {
          const ur = u.rows[0];
          console.log(`    계정: id=${ur.id} username=${ur.username} created=${ur.created_at} admin=${ur.is_admin}`);
        }
      }
    }
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
