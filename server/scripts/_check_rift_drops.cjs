const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  // 시공 몬스터(500/501/502) 정보 + 드랍 테이블
  const r = await pool.query(
    `SELECT id, name, level, drop_table FROM monsters WHERE id IN (500, 501, 502) ORDER BY id`
  );
  console.log(`\n=== 시공의 균열 몬스터 ===`);
  for (const m of r.rows) {
    console.log(`\n[${m.id}] ${m.name} (lv.${m.level}):`);
    console.log(JSON.stringify(m.drop_table, null, 2));
  }

  // 시공 관련 추정 재료템 — items 테이블에서 이름으로 검색
  const im = await pool.query(
    `SELECT id, name, type, description FROM items
       WHERE name LIKE '%시공%' OR name LIKE '%차원%' OR name LIKE '%균열%'
       ORDER BY id`
  );
  console.log(`\n=== 시공/차원 관련 아이템 ===`);
  for (const it of im.rows) {
    console.log(`  [${it.id}] ${it.name} (type=${it.type})`);
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
