// 4직업 초월 노드(각 5개) 12시부터 72° 간격으로 원형 배치
// 반지름 22

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const RADIUS = 22;
// 5개 × 72° — 12시부터 시계방향: 12 → 2:30 → 5:00 → 7:30 → 9:30
// 각도: -90°(12), -90+72=-18°, -18+72=54°, 54+72=126°, 126+72=198°
const ANGLES_DEG = [-90, -18, 54, 126, 198];

function polar(deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: Math.round(RADIUS * Math.cos(rad)), y: Math.round(RADIUS * Math.sin(rad)) };
}

(async () => {
  const r = await pool.query(`
    SELECT id, class_exclusive, name FROM node_definitions
    WHERE tier='huge' AND class_exclusive IN ('warrior','mage','cleric','rogue')
    ORDER BY class_exclusive, id
  `);

  // 클래스별 그룹
  const byClass = {};
  for (const row of r.rows) {
    if (!byClass[row.class_exclusive]) byClass[row.class_exclusive] = [];
    byClass[row.class_exclusive].push(row);
  }

  const client = await pool.connect();
  let updated = 0;
  try {
    await client.query('BEGIN');
    for (const [cls, nodes] of Object.entries(byClass)) {
      console.log(`\n[${cls}]`);
      for (let i = 0; i < nodes.length; i++) {
        const pos = polar(ANGLES_DEG[i] || (-90 + i * 72));
        await client.query(
          `UPDATE node_definitions SET position_x=$1, position_y=$2 WHERE id=$3`,
          [pos.x, pos.y, nodes[i].id]
        );
        console.log(` ${nodes[i].name.padEnd(14)} → (${pos.x}, ${pos.y})`);
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
  console.log(`\n총 ${updated}개 업데이트`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
