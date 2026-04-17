// 소환사 노드 444개 전체 재배치:
// - small 299: r=2~9 (중앙부)
// - medium 108: r=10~12
// - large 29: r=13~14
// - huge 8: r=15~16 (외곽)
// prereq: 각 노드는 가장 가까운 내측 노드를 prereq로 지정 (방사형 체인)

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const GLOBAL_SEEN = new Set();
function genRingPositions(rMin, rMax) {
  const positions = [];
  const seen = GLOBAL_SEEN;
  for (let r = rMin; r <= rMax; r++) {
    const circumSlots = Math.max(6, Math.round(2 * Math.PI * r * 1.4));
    const ringPts = [];
    for (let i = 0; i < circumSlots; i++) {
      const theta = (2 * Math.PI * i) / circumSlots;
      const x = Math.round(r * Math.cos(theta));
      const y = Math.round(r * Math.sin(theta));
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ringPts.push({ x, y, r, theta });
    }
    // 각도 순 정렬 (안정적 배치)
    ringPts.sort((a, b) => a.theta - b.theta);
    positions.push(...ringPts);
  }
  return positions;
}

(async () => {
  // 1. 기존 소환사 노드 조회 (tier + id 순)
  const r = await pool.query(
    `SELECT id, name, tier FROM node_definitions WHERE class_exclusive='summoner' ORDER BY
       CASE tier WHEN 'small' THEN 1 WHEN 'medium' THEN 2 WHEN 'large' THEN 3 WHEN 'huge' THEN 4 END, id`
  );
  const nodes = r.rows;
  console.log(`총 ${nodes.length}개 소환사 노드 재배치 시작`);

  const smalls  = nodes.filter(n => n.tier === 'small');
  const mediums = nodes.filter(n => n.tier === 'medium');
  const larges  = nodes.filter(n => n.tier === 'large');
  const huges   = nodes.filter(n => n.tier === 'huge');
  console.log(`  small=${smalls.length} medium=${mediums.length} large=${larges.length} huge=${huges.length}`);

  // 2. 링별 position 생성
  //    small: r=2~10 (총 용량 확인 후 조정)
  //    medium: r=11~13
  //    large: r=14~15
  //    huge: r=16~17
  const smallPositions  = genRingPositions(2, 10);
  const mediumPositions = genRingPositions(11, 13);
  const largePositions  = genRingPositions(14, 15);
  const hugePositions   = genRingPositions(16, 17);
  console.log(`  용량 small=${smallPositions.length} medium=${mediumPositions.length} large=${largePositions.length} huge=${hugePositions.length}`);

  if (smallPositions.length < smalls.length)   throw new Error(`small 용량 부족 ${smallPositions.length}<${smalls.length}`);
  if (mediumPositions.length < mediums.length) throw new Error(`medium 용량 부족 ${mediumPositions.length}<${mediums.length}`);
  if (largePositions.length < larges.length)   throw new Error(`large 용량 부족 ${largePositions.length}<${larges.length}`);
  if (hugePositions.length < huges.length)     throw new Error(`huge 용량 부족 ${hugePositions.length}<${huges.length}`);

  // 3. 각 노드에 position 할당
  const placed = []; // {id, x, y, r, theta, tier, tierIdx}
  function place(list, positions, tierIdx) {
    for (let i = 0; i < list.length; i++) {
      const pos = positions[i];
      placed.push({ id: list[i].id, x: pos.x, y: pos.y, r: pos.r, theta: pos.theta, tier: list[i].tier, tierIdx });
    }
  }
  place(smalls,  smallPositions,  1);
  place(mediums, mediumPositions, 2);
  place(larges,  largePositions,  3);
  place(huges,   hugePositions,   4);

  // 4. prereq 계산
  //    각 노드: "내측"에 있는 노드 중 가장 가까운 것을 prereq로
  //    - 내측 = 더 작은 r 또는 같은 r에서 각도 이전 (직전 노드)
  //    - 가장 안쪽 small(첫번째) 은 prereq 없음
  function distSq(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  }

  // 이미 배치된 노드 리스트에서 탐색 (inner-first 순이므로 앞쪽부터 innermost)
  // 빠른 탐색을 위해 r별로 그룹화
  const byRing = new Map();
  for (const p of placed) {
    if (!byRing.has(p.r)) byRing.set(p.r, []);
    byRing.get(p.r).push(p);
  }

  const prereqMap = new Map(); // id -> [prereqId]
  for (const p of placed) {
    // 내측 후보: r-1 링 + 같은 tier의 r-0 (이미 배치된 앞쪽) + 한 단계 이전 tier 최외곽
    // 단순화: r < p.r 인 모든 노드 중 가장 가까운 것
    const candidates = [];
    for (let rr = Math.max(0, p.r - 2); rr < p.r; rr++) {
      const ring = byRing.get(rr);
      if (ring) candidates.push(...ring);
    }
    if (candidates.length === 0) {
      // 가장 안쪽(r=2) → prereq 없음
      prereqMap.set(p.id, null);
      continue;
    }
    let best = candidates[0];
    let bestD = distSq(p, best);
    for (let i = 1; i < candidates.length; i++) {
      const d = distSq(p, candidates[i]);
      if (d < bestD) { bestD = d; best = candidates[i]; }
    }
    prereqMap.set(p.id, [best.id]);
  }

  // 5. DB 업데이트 (한 트랜잭션)
  console.log('DB 업데이트 시작...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of placed) {
      const prereq = prereqMap.get(p.id);
      await client.query(
        `UPDATE node_definitions SET position_x=$1, position_y=$2, prerequisites=$3::int[] WHERE id=$4`,
        [p.x, p.y, prereq, p.id]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // 6. 검증
  const noPrereqR = await pool.query(
    `SELECT COUNT(*) cnt FROM node_definitions WHERE class_exclusive='summoner' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL)`
  );
  const totalR = await pool.query(`SELECT COUNT(*) cnt FROM node_definitions WHERE class_exclusive='summoner'`);
  console.log(`\n=== 결과 ===`);
  console.log(`  총 노드: ${totalR.rows[0].cnt}`);
  console.log(`  prereq 없음(entry): ${noPrereqR.rows[0].cnt}`);

  // position 중복 확인
  const dupR = await pool.query(
    `SELECT position_x, position_y, COUNT(*) cnt FROM node_definitions WHERE class_exclusive='summoner' GROUP BY position_x, position_y HAVING COUNT(*)>1`
  );
  if (dupR.rowCount > 0) {
    console.log(`⚠️ 중복 position ${dupR.rowCount}개`);
    for (const row of dupR.rows.slice(0, 5)) console.log(`  (${row.position_x},${row.position_y}) x${row.cnt}`);
  } else {
    console.log(`  ✓ position 중복 없음`);
  }

  // tier 별 radius 범위
  const rangeR = await pool.query(`
    SELECT tier,
      MIN(position_x*position_x + position_y*position_y) min_r2,
      MAX(position_x*position_x + position_y*position_y) max_r2,
      COUNT(*) cnt
    FROM node_definitions WHERE class_exclusive='summoner' GROUP BY tier ORDER BY
      CASE tier WHEN 'small' THEN 1 WHEN 'medium' THEN 2 WHEN 'large' THEN 3 WHEN 'huge' THEN 4 END
  `);
  console.log(`\n=== tier별 반경 ===`);
  for (const row of rangeR.rows) {
    const minR = Math.sqrt(row.min_r2).toFixed(1);
    const maxR = Math.sqrt(row.max_r2).toFixed(1);
    console.log(`  ${row.tier}: ${row.cnt}개 | r=${minR}~${maxR}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
