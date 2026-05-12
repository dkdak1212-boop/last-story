const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

// scale=38 (NodeTreeScreen). x: -7 ~ 8, y: -5 ~ 4 → 화면 중앙 (0,0) 기준 정렬
// 위(y -) 키스톤 → 아래(y +) 루트로 흐름. prereq 흐름 시각적으로 정렬.
const POSITIONS = [
  // 루트 (smalls 1단): 그림자 민첩 1/2/3
  [1282, -3, 4], [1283, 0, 4], [1284, 3, 4],
  // 그림자 신속 1/2/3
  [1285, -3, 3], [1286, 0, 3], [1287, 3, 3],
  // 그림자 치명 1/2/3
  [1288, -3, 2], [1289, 0, 2], [1290, 3, 2],
  // 분신 강화 I 1~4
  [1291, -3, 1], [1292, -1, 1], [1293, 1, 1], [1294, 3, 1],
  // mediums (8) — 양옆 spread, prereq 위치 가능한 가까이
  [1299, -7, -1],  // 독의 군주 (prereq 1291)
  [1296, -5, -1],  // 분신 강화 II B (prereq 1285)
  [1295, -3, -1],  // 분신 강화 II A (prereq 1283)
  [1298, -1, -1],  // 그림자 가속 (prereq 1289)
  [1300,  1, -1],  // 회피 강화 (prereq 1293)
  [1297,  3, -1],  // 분신 강화 II C (prereq 1287)
  [1301,  5, -1],  // 그림자 흡혈 (prereq 1294)
  [1302,  7, -1],  // 분신 다단 (prereq 1294)
  // large (3)
  [1303, -5, -3],  // 분신 분리 (prereq 1296)
  [1304, -1, -3],  // 그림자 폭주 (prereq 1298)
  [1305,  1, -3],  // 독의 폭발 (prereq 1300)
  // huge (4)
  [1306, -5, -5],  // 그림자 군주 (prereq 1303)
  [1307, -1, -5],  // 독의 화신 (prereq 1304)
  [1308,  1, -5],  // 그림자 도주 (prereq 1305)
  [1309,  4, -5],  // 연쇄 처형 (prereq 1305)
];

(async () => {
  try {
    let updated = 0;
    for (const [id, x, y] of POSITIONS) {
      const r = await pool.query(
        `UPDATE node_definitions SET position_x=$1, position_y=$2 WHERE id=$3 AND zone='north_rogue'`,
        [x, y, id]
      );
      updated += r.rowCount;
    }
    console.log(`updated=${updated}/${POSITIONS.length}`);
    const r = await pool.query(
      `SELECT id, name, tier, position_x, position_y FROM node_definitions WHERE zone='north_rogue' ORDER BY tier, position_x`
    );
    for (const n of r.rows) console.log(`${n.tier.padEnd(6)} (${String(n.position_x).padStart(4)},${String(n.position_y).padStart(4)})  ${n.name}`);
  } finally { await pool.end(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
