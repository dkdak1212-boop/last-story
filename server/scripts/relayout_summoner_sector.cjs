// 소환사 노드트리 섹터 기반 재배치 (333개)
// 8개 방사형 섹터 × 각 섹터: small 23-24 / medium 13-14 / large 3-4 / huge 1
// 각 섹터는 r=2(입구)에서 r=17(huge)까지 점진 확장
// prereq: 같은 섹터 내에서 r-1 링의 가장 가까운 노드를 선행으로 지정
//         r=2 small 은 entry (prereq null)

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 2 });

const SECTORS = 8;
const SECTOR_SPAN = (2 * Math.PI) / SECTORS; // 45°

// 각 섹터 반지름별 노드 할당 (tier: small 24, medium 14, large 4, huge 1 → 섹터 합 43)
// 전체: small 188 (4×24 + 4×23) / medium 108 (4×14 + 4×13) / large 29 (5×4 + 3×3) / huge 8 (8×1)
// 각 섹터의 tier별 실제 개수는 전체 index에 따라 분배

// radius별 노드 수 (섹터당)
//   r=2: 1 small (entry)
//   r=3: 2 small
//   r=4: 3 small
//   r=5: 3 small
//   r=6: 3 small
//   r=7: 4 small
//   r=8: 4 small
//   r=9: 3-4 small  (4일 때 총 24, 3일 때 23)
//   r=10: 3 medium
//   r=11: 4 medium
//   r=12: 4 medium
//   r=13: 2-3 medium (3일 때 총 14, 2일 때 13)
//   r=14: 1-2 large
//   r=15: 1 large
//   r=16: 1 large
//   r=17: 1 huge

function buildSectorSlots(smallCount, mediumCount, largeCount) {
  // 각 tier count 에 맞게 radius별 슬롯 수를 조정
  const slots = []; // [{r, tier}]
  // small
  const smallDist = [1, 2, 3, 3, 3, 4, 4, smallCount === 24 ? 4 : 3]; // r=2~9
  if (smallDist.reduce((a, b) => a + b, 0) !== smallCount) {
    throw new Error(`smallDist mismatch: ${smallCount} expected ${smallDist.reduce((a,b)=>a+b,0)}`);
  }
  let rIdx = 2;
  for (const n of smallDist) {
    for (let i = 0; i < n; i++) slots.push({ r: rIdx, tier: 'small' });
    rIdx++;
  }
  // medium
  const medDist = [3, 4, 4, mediumCount === 14 ? 3 : 2]; // r=10~13
  if (medDist.reduce((a, b) => a + b, 0) !== mediumCount) {
    throw new Error(`medDist mismatch: ${mediumCount}`);
  }
  rIdx = 10;
  for (const n of medDist) {
    for (let i = 0; i < n; i++) slots.push({ r: rIdx, tier: 'medium' });
    rIdx++;
  }
  // large
  const lgDist = [largeCount === 4 ? 2 : 1, 1, 1]; // r=14~16
  if (lgDist.reduce((a, b) => a + b, 0) !== largeCount) {
    throw new Error(`lgDist mismatch: ${largeCount}`);
  }
  rIdx = 14;
  for (const n of lgDist) {
    for (let i = 0; i < n; i++) slots.push({ r: rIdx, tier: 'large' });
    rIdx++;
  }
  // huge
  slots.push({ r: 17, tier: 'huge' });
  return slots;
}

(async () => {
  // 1. 기존 소환사 노드 로드
  const r = await pool.query(
    `SELECT id, name, tier FROM node_definitions
     WHERE class_exclusive='summoner'
     ORDER BY CASE tier WHEN 'small' THEN 1 WHEN 'medium' THEN 2 WHEN 'large' THEN 3 WHEN 'huge' THEN 4 END, id`
  );
  const all = r.rows;
  const smalls  = all.filter(n => n.tier === 'small');
  const mediums = all.filter(n => n.tier === 'medium');
  const larges  = all.filter(n => n.tier === 'large');
  const huges   = all.filter(n => n.tier === 'huge');
  console.log(`로드: small=${smalls.length} medium=${mediums.length} large=${larges.length} huge=${huges.length}`);

  // 2. 섹터별 tier 개수 정하기 (4개 섹터가 24개 small, 4개 섹터가 23개 small 등)
  const perSector = [];
  // small 분배
  const smBase = Math.floor(smalls.length / SECTORS);
  const smExtra = smalls.length - smBase * SECTORS;
  // medium
  const mdBase = Math.floor(mediums.length / SECTORS);
  const mdExtra = mediums.length - mdBase * SECTORS;
  // large
  const lgBase = Math.floor(larges.length / SECTORS);
  const lgExtra = larges.length - lgBase * SECTORS;

  for (let i = 0; i < SECTORS; i++) {
    perSector.push({
      small: smBase + (i < smExtra ? 1 : 0),
      medium: mdBase + (i < mdExtra ? 1 : 0),
      large: lgBase + (i < lgExtra ? 1 : 0),
      huge: 1,
    });
  }
  console.log('섹터별:', perSector.map((p, i) => `s${i}:${p.small}/${p.medium}/${p.large}/${p.huge}`).join(' '));

  // 3. 각 섹터에 노드 할당 (tier 순서대로 global queue 에서 pop)
  const qSmall = [...smalls];
  const qMedium = [...mediums];
  const qLarge = [...larges];
  const qHuge = [...huges];

  const used = new Set(); // 'x,y'
  const placements = []; // {id, x, y, r, sector, tier, index_in_sector}

  function placeAt(x, y, node, meta) {
    placements.push({ id: node.id, x, y, ...meta });
    used.add(`${x},${y}`);
  }

  function findFree(cx, cy) {
    // 주변 셀 중 빈 자리 탐색 (작은 반경 진동)
    const offsets = [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1],[2,0],[-2,0],[0,2],[0,-2]];
    for (const [dx, dy] of offsets) {
      const x = cx + dx, y = cy + dy;
      if (!used.has(`${x},${y}`)) return { x, y };
    }
    return null;
  }

  for (let s = 0; s < SECTORS; s++) {
    const cfg = perSector[s];
    const slots = buildSectorSlots(cfg.small, cfg.medium, cfg.large);
    // 섹터 각도: 중심 각도 = s * 45°, span = ±22.5°
    const angleCenter = s * SECTOR_SPAN;

    // 같은 r 에 여러 슬롯이 있을 수 있음 — 각도 분배
    const byRadius = new Map();
    for (const slot of slots) {
      if (!byRadius.has(slot.r)) byRadius.set(slot.r, []);
      byRadius.get(slot.r).push(slot);
    }

    for (const [rVal, slotArr] of byRadius) {
      const n = slotArr.length;
      for (let i = 0; i < n; i++) {
        // 각도 offset: -span/2 ~ +span/2 로 균등 배치 (n=1이면 중앙)
        const offset = n === 1 ? 0 : ((i / (n - 1)) - 0.5) * (SECTOR_SPAN * 0.9);
        const theta = angleCenter + offset;
        let x = Math.round(rVal * Math.cos(theta));
        let y = Math.round(rVal * Math.sin(theta));
        // 충돌 해결
        if (used.has(`${x},${y}`)) {
          const free = findFree(x, y);
          if (!free) throw new Error(`No free slot near (${x},${y}) for sector ${s} r=${rVal}`);
          x = free.x; y = free.y;
        }
        // tier 에 맞는 node 꺼내기
        let node;
        if (slotArr[i].tier === 'small')  node = qSmall.shift();
        else if (slotArr[i].tier === 'medium') node = qMedium.shift();
        else if (slotArr[i].tier === 'large')  node = qLarge.shift();
        else node = qHuge.shift();
        if (!node) throw new Error(`queue empty for tier ${slotArr[i].tier}`);
        placeAt(x, y, node, { r: rVal, sector: s, tier: slotArr[i].tier });
      }
    }
  }

  console.log(`배치 완료: ${placements.length}개`);
  if (qSmall.length || qMedium.length || qLarge.length || qHuge.length) {
    console.log(`남은 노드: small=${qSmall.length} medium=${qMedium.length} large=${qLarge.length} huge=${qHuge.length}`);
  }

  // 4. prereq 계산 — 같은 섹터에서 r-1 링의 가장 가까운 노드
  function distSq(a, b) { return (a.x-b.x)**2 + (a.y-b.y)**2; }

  const bySector = new Map();
  for (const p of placements) {
    if (!bySector.has(p.sector)) bySector.set(p.sector, []);
    bySector.get(p.sector).push(p);
  }

  const prereqMap = new Map();
  for (const p of placements) {
    if (p.r === 2) {
      prereqMap.set(p.id, null);
      continue;
    }
    // 같은 섹터에서 r < p.r 인 가장 가까운 노드
    const sectorNodes = bySector.get(p.sector) || [];
    const candidates = sectorNodes.filter(x => x.r < p.r);
    if (candidates.length === 0) {
      // 섹터 내부에 없으면 인접 섹터 포함
      const adjSector = (p.sector + 1) % SECTORS;
      const adjSector2 = (p.sector - 1 + SECTORS) % SECTORS;
      candidates.push(...(bySector.get(adjSector) || []).filter(x => x.r < p.r));
      candidates.push(...(bySector.get(adjSector2) || []).filter(x => x.r < p.r));
    }
    if (candidates.length === 0) {
      prereqMap.set(p.id, null);
      continue;
    }
    // 가장 가까운 후보 찾기
    let best = candidates[0], bestD = distSq(p, best);
    for (let i = 1; i < candidates.length; i++) {
      const d = distSq(p, candidates[i]);
      if (d < bestD) { bestD = d; best = candidates[i]; }
    }
    prereqMap.set(p.id, [best.id]);
  }

  // 5. DB 업데이트 (트랜잭션)
  console.log('DB 업데이트 중...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of placements) {
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
  const totalR = await pool.query(`SELECT COUNT(*) cnt FROM node_definitions WHERE class_exclusive='summoner'`);
  const noPrereqR = await pool.query(`SELECT COUNT(*) cnt FROM node_definitions WHERE class_exclusive='summoner' AND (prerequisites IS NULL OR array_length(prerequisites,1) IS NULL)`);
  const dupR = await pool.query(`SELECT position_x, position_y, COUNT(*) cnt FROM node_definitions WHERE class_exclusive='summoner' GROUP BY position_x, position_y HAVING COUNT(*)>1`);

  console.log(`\n=== 결과 ===`);
  console.log(`  총 노드: ${totalR.rows[0].cnt}`);
  console.log(`  entry (prereq 없음): ${noPrereqR.rows[0].cnt}`);
  console.log(`  position 중복: ${dupR.rowCount}`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
