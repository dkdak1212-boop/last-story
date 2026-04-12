const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // 마력의 흐름 직접 수정 (쿨다운 -13행동 + 쿨다운 추가 -1 → 쿨다운 -13행동, 쿨다운 -1행동)
  const fix1 = await pool.query(`
    UPDATE node_definitions SET description = '쿨다운 -13행동, 쿨다운 -1행동'
    WHERE name = '마력의 흐름'
  `);
  console.log(`마력의 흐름: ${fix1.rowCount}행`);

  // '쿨다운 추가 -N' 패턴 모두 찾아 '쿨다운 -N행동'으로
  const r = await pool.query(`SELECT id, name, description FROM node_definitions WHERE description LIKE '%쿨다운 추가%'`);
  for (const row of r.rows) {
    const desc = row.description.replace(/쿨다운 추가 -(\d+)/g, '쿨다운 -$1행동');
    if (desc !== row.description) {
      await pool.query('UPDATE node_definitions SET description = $1 WHERE id = $2', [desc, row.id]);
      console.log(`  ${row.name}: ${desc}`);
    }
  }

  // 검증
  const check = await pool.query(`SELECT name, description FROM node_definitions WHERE description LIKE '%쿨다운%'`);
  console.log('\n쿨다운 관련 노드:');
  for (const row of check.rows) console.log(`  ${row.name}: ${row.description}`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
