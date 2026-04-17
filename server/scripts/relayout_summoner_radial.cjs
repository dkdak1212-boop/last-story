// 1) 기존 core 의 소환사 노드 44개 → '소환사 전용' zone 으로 이동
// 2) 소환사 전용 zone 244개 전체를 중앙(0,0) 시작 방사형으로 재배치
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const ZONE = '소환사 전용';

// 정수 격자 + 충돌 회피로 폴라 배치
function placeOnRing(count, baseRadius, used) {
  const placed = [];
  for (let i = 0; i < count; i++) {
    const baseAngle = (i / count) * 2 * Math.PI;
    let r = baseRadius;
    let angle = baseAngle;
    let attempt = 0;
    while (attempt < 200) {
      const x = Math.round(Math.cos(angle) * r);
      const y = Math.round(Math.sin(angle) * r);
      const key = `${x},${y}`;
      if (!used.has(key)) {
        used.add(key);
        placed.push([x, y]);
        break;
      }
      // 충돌이면 각도 미세 조정 → 안 되면 반경 +1
      attempt++;
      angle += 0.05;
      if (attempt % 30 === 0) r += 1;
    }
  }
  return placed;
}

(async () => {
  // 1) 기존 core 의 소환사 노드 zone 이동
  const move = await pool.query(
    `UPDATE node_definitions SET zone = $1 WHERE class_exclusive = 'summoner' AND zone = 'core' RETURNING id, tier`,
    [ZONE]
  );
  console.log(`core → ${ZONE}: ${move.rowCount}개 이동`);

  // 2) 소환사 전용 zone 244개 전체 — tier별 ID 정렬
  const all = await pool.query(
    `SELECT id, tier FROM node_definitions WHERE zone = $1 ORDER BY
      CASE tier WHEN 'huge' THEN 0 WHEN 'large' THEN 1 WHEN 'medium' THEN 2 WHEN 'small' THEN 3 END,
      id`,
    [ZONE]
  );
  console.log(`재배치 대상: ${all.rowCount}개`);

  const byTier = { huge: [], large: [], medium: [], small: [] };
  for (const r of all.rows) byTier[r.tier].push(r.id);
  console.log(`분포: huge=${byTier.huge.length} large=${byTier.large.length} medium=${byTier.medium.length} small=${byTier.small.length}`);

  // 좌표 사용 추적
  const used = new Set();

  // ── huge: 1 중앙 + 나머지를 반경 3 환에 ──
  const hugePositions = [];
  if (byTier.huge.length > 0) {
    hugePositions.push([0, 0]); used.add('0,0');
    if (byTier.huge.length > 1) {
      const more = placeOnRing(byTier.huge.length - 1, 3, used);
      hugePositions.push(...more);
    }
  }

  // ── large: 반경 5 환 ──
  const largePositions = placeOnRing(byTier.large.length, 5, used);

  // ── medium: 반경 7~9 (절반씩) ──
  const half1 = Math.ceil(byTier.medium.length / 2);
  const half2 = byTier.medium.length - half1;
  const mediumPositions = [
    ...placeOnRing(half1, 7, used),
    ...placeOnRing(half2, 9, used),
  ];

  // ── small: 반경 11, 13, 15 (40/50/+) ──
  const sCount = byTier.small.length;
  const sR1 = Math.ceil(sCount / 3);
  const sR2 = Math.ceil(sCount / 3);
  const sR3 = sCount - sR1 - sR2;
  const smallPositions = [
    ...placeOnRing(sR1, 11, used),
    ...placeOnRing(sR2, 13, used),
    ...placeOnRing(sR3, 15, used),
  ];

  // ID와 좌표 매핑
  const updates = [];
  byTier.huge.forEach((id, i) => updates.push([id, hugePositions[i]]));
  byTier.large.forEach((id, i) => updates.push([id, largePositions[i]]));
  byTier.medium.forEach((id, i) => updates.push([id, mediumPositions[i]]));
  byTier.small.forEach((id, i) => updates.push([id, smallPositions[i]]));

  // UPDATE 일괄
  for (const [id, [x, y]] of updates) {
    await pool.query(`UPDATE node_definitions SET position_x = $1, position_y = $2 WHERE id = $3`, [x, y, id]);
  }
  console.log(`UPDATE 완료: ${updates.length}건`);

  // 검증
  const dup = await pool.query(`
    SELECT position_x, position_y, COUNT(*)::int AS c FROM node_definitions
    WHERE zone = $1 GROUP BY position_x, position_y HAVING COUNT(*) > 1
  `, [ZONE]);
  if (dup.rowCount > 0) {
    console.warn(`⚠️ 좌표 중복 ${dup.rowCount}건:`, dup.rows.slice(0, 5));
  } else {
    console.log('좌표 중복 없음 ✅');
  }

  const minMax = await pool.query(`SELECT MIN(position_x) AS minx, MAX(position_x) AS maxx, MIN(position_y) AS miny, MAX(position_y) AS maxy FROM node_definitions WHERE zone = $1`, [ZONE]);
  console.log('좌표 범위:', minMax.rows[0]);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
