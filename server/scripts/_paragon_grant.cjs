const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

// 이전 5pt+ 보유했던 33명 + 이미지 잘린 가능성 있는 2명 — 이전 보유량 + 2pt 보전.
// 이미지 명단(33명) 만 적용. 51pt T17, 21pt 3배 는 명단 외 → 5pt 일률에 포함됨.
const GRANT_LIST = [
  // [character_id, prev_pt]
  [593, 10],   // 바다의왕자
  [33, 9],     // 성직자
  [1053, 9],   // 깨양갱
  [238, 8],    // 로얄
  [823, 8],    // 홀리
  [976, 8],    // 똘똘한박서연
  [51, 7],     // 오크왕상제
  [65, 7],     // 일단
  [260, 7],    // 한량
  [264, 7],    // KEY
  [421, 7],    // 혈향
  [428, 7],    // 사하
  [818, 7],    // 번뇌
  [1137, 7],   // 나혼자레벨업
  [1282, 7],   // 아우라
  [356, 6],    // 사신
  [409, 6],    // 봉다리
  [436, 6],    // 아스란
  [480, 6],    // 홍빠
  [892, 6],    // 거의
  [20, 5],     // 교황
  [164, 5],    // 분노
  [198, 5],    // 하치만다
  [408, 5],    // 날따르라
  [691, 5],    // 진석
  [843, 5],    // 정점
  [913, 5],    // 오로라핑
  [948, 5],    // 천마
  [1347, 5],   // 뱅직자
  [1509, 5],   // 오빠커피
  [2227, 5],   // 토지
  [2422, 5],   // T51
  [2520, 5],   // T100
];

(async () => {
  await pool.query('BEGIN');
  try {
    const grantIds = GRANT_LIST.map(([id]) => id);

    // 1) 명단 33명: 이전 보유 + 2pt
    let granted33 = 0;
    for (const [cid, prevPt] of GRANT_LIST) {
      const newPt = prevPt + 2;
      const r = await pool.query(`UPDATE characters SET paragon_points = $1 WHERE id = $2 RETURNING name, level`, [newPt, cid]);
      if (r.rowCount) {
        granted33++;
        console.log(`  +명단 #${cid} ${r.rows[0].name} (Lv${r.rows[0].level}) → ${newPt}pt`);
      }
    }

    // 2) 명단 외 Lv.100+ 캐릭에게 5pt 일률
    const r2 = await pool.query(`
      UPDATE characters SET paragon_points = 5
       WHERE level >= 100
         AND id NOT IN (${grantIds.map((_, i) => `$${i+1}`).join(',')})
       RETURNING id`, grantIds);
    console.log(`\n+일률 5pt: ${r2.rowCount}명 (Lv.100+ 명단 외)`);

    // 검증
    const total = await pool.query(`SELECT SUM(paragon_points)::int AS s, COUNT(*)::int AS n FROM characters WHERE paragon_points > 0`);
    console.log(`\n최종 — paragon 보유: ${total.rows[0].n}명, 총 ${total.rows[0].s}pt`);

    // 분포 요약
    const dist = await pool.query(`SELECT paragon_points AS pp, COUNT(*)::int AS n FROM characters WHERE paragon_points > 0 GROUP BY pp ORDER BY pp DESC`);
    console.log('\n=== 분포 ===');
    for (const r of dist.rows) console.log(`  ${r.pp}pt → ${r.n}명`);

    await pool.query('COMMIT');
    console.log('\nCOMMIT 완료');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
