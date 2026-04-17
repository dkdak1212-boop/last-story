const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const f = await pool.query(`SELECT id, name, required_level, monster_pool FROM fields WHERE name LIKE '%무한%' OR name LIKE '%차원%' ORDER BY id`);
  console.log('필드:', f.rows);

  // monster_pool에서 몬스터 id 추출
  for (const fld of f.rows) {
    const ids = fld.monster_pool || [];
    if (ids.length === 0) continue;
    const m = await pool.query(`SELECT id, name, level FROM monsters WHERE id = ANY($1::int[]) ORDER BY level`, [ids]);
    console.log(`\n[${fld.name}] 몬스터:`);
    m.rows.forEach(r => console.log(`  ${r.id} ${r.name} (Lv.${r.level})`));
  }

  // items 테이블 컬럼 확인 (class_restriction, unique_prefix_stats 존재 여부)
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'items' ORDER BY ordinal_position`);
  console.log('\nitems 컬럼:', cols.rows.map(r => r.column_name).join(', '));

  // 현재 사용 중인 최대 item id
  const maxId = await pool.query(`SELECT MAX(id) AS max FROM items`);
  console.log('현재 max item id:', maxId.rows[0].max);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
