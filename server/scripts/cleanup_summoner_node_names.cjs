// 소환사 노드 이름 정리: " S 1-9", " M 2-3", " 1-1" 등 인덱스 suffix 제거
// + "작은 강화" 같은 모호 표기를 효과 기반 깔끔한 이름으로 통일

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

function cleanName(name, desc) {
  let n = name;
  // " S 1-9" / " M 1-2" 형태 제거
  n = n.replace(/\s+[SM]\s+\d+-\d+$/, '');
  // " 1-2" 끝의 인덱스만 제거
  n = n.replace(/\s+\d+-\d+$/, '');
  // "작은 강화" 표기 통일
  n = n.replace(/\s*작은 강화/, ' 강화');
  return n.trim();
}

(async () => {
  const r = await pool.query(`
    SELECT id, name, description FROM node_definitions
    WHERE class_exclusive='summoner'
      AND (name ~ ' [SM] [0-9]+-[0-9]+' OR name ~ '[0-9]+-[0-9]+$' OR name LIKE '%작은 강화%')
    ORDER BY id
  `);
  console.log(`대상: ${r.rowCount}`);

  const client = await pool.connect();
  let updated = 0;
  try {
    await client.query('BEGIN');
    for (const row of r.rows) {
      const newName = cleanName(row.name, row.description);
      if (newName !== row.name) {
        await client.query(`UPDATE node_definitions SET name=$1 WHERE id=$2`, [newName, row.id]);
        updated++;
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  console.log(`업데이트: ${updated}개`);

  // 검증: 변경 결과 샘플
  const v = await pool.query(`
    SELECT name, COUNT(*) cnt FROM node_definitions
    WHERE class_exclusive='summoner'
    GROUP BY name HAVING COUNT(*) > 1
    ORDER BY cnt DESC, name LIMIT 30
  `);
  console.log('\n=== 동일 이름 그룹 (정리 후) ===');
  for (const row of v.rows) console.log(` x${row.cnt}`, row.name);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
