// 소환사 노드 라벨/설명 정리
// A. "스피드" 라벨 → 실제 효과(데미지)로 수정
// B. "서포터/하이브리드" 분류 명칭 → "소환수 강화"로 통일

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  const r = await pool.query(`
    SELECT id, name, description, effects, tier
    FROM node_definitions WHERE class_exclusive='summoner'
  `);
  console.log(`스캔: ${r.rowCount}개 노드`);

  const client = await pool.connect();
  let updated = 0;
  try {
    await client.query('BEGIN');
    for (const row of r.rows) {
      let newName = row.name;
      let newDesc = row.description;

      // A. "소환수 스피드" → "소환수 데미지" (effect 는 summon_*_dmg 로 이미 리라벨된 상태)
      newName = newName
        .replace(/소환수 스피드/g, '소환수 데미지')
        .replace(/질풍 소환/g, '폭풍의 군림');  // "질풍" 도 스피드 연상 → 변경
      newDesc = newDesc
        .replace(/소환수 스피드/g, '소환수 데미지')
        .replace(/스피드 \+(\d+)/g, (m, n) => `데미지 +${n}%`);

      // B. 서포터/하이브리드 → "소환수 강화" / "오오라"
      newName = newName
        .replace(/서포터 소환수/g, '소환수')
        .replace(/하이브리드 소환수/g, '소환수')
        .replace(/서포터 특화/g, '소환수 강화')
        .replace(/하이브리드 특화/g, '소환수 강화')
        .replace(/서포터 오오라/g, '오오라 강화')
        .replace(/탱커 오오라/g, '오오라 강화')
        .replace(/딜러 오오라/g, '오오라 강화')
        .replace(/탱커 특화/g, '소환수 강화')
        .replace(/딜러 특화/g, '소환수 강화');
      newDesc = newDesc
        .replace(/서포터 소환수/g, '소환수')
        .replace(/하이브리드 소환수/g, '소환수')
        .replace(/탱커 소환수/g, '소환수')
        .replace(/딜러 소환수/g, '소환수');

      if (newName !== row.name || newDesc !== row.description) {
        await client.query(`UPDATE node_definitions SET name=$1, description=$2 WHERE id=$3`,
          [newName, newDesc, row.id]);
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

  // 샘플 출력
  const v = await pool.query(`
    SELECT name, COUNT(*) cnt FROM node_definitions
    WHERE class_exclusive='summoner'
    GROUP BY name ORDER BY cnt DESC LIMIT 15
  `);
  console.log('\n=== 상위 이름 ===');
  for (const row of v.rows) console.log(` x${row.cnt}`, row.name);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
