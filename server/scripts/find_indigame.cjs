const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  const c = await pool.query(
    `SELECT c.id AS char_id, c.name, c.class_name, c.level, c.user_id, u.username, u.created_at AS user_created
     FROM characters c JOIN users u ON u.id = c.user_id
     WHERE c.name = '인디게임평가단'`
  );
  console.log('캐릭터:', c.rows);

  // 같은 user_id 다른 캐릭터도 보기
  if (c.rowCount > 0) {
    const uid = c.rows[0].user_id;
    const all = await pool.query(`SELECT id, name, class_name, level FROM characters WHERE user_id = $1 ORDER BY id`, [uid]);
    console.log(`\n같은 계정(user_id=${uid})의 모든 캐릭터:`);
    all.rows.forEach(r => console.log(`  id=${r.id} ${r.name} (${r.class_name}, Lv.${r.level})`));
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
