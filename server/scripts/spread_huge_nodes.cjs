// 4직업 초월 노드(각 5개) 흩어진 배치로 재설정
// 기존 2개 + 신규 3개 = 총 5개를 서로 최소 3 거리 이상 떨어지도록

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

// 각 직업 5개 huge 좌표 — 상호 거리 ≥ 3
const LAYOUT = {
  warrior: [
    { name: '절대자의 무공', x: 0,  y: -22 }, // 기존
    { name: '불멸의 방패',   x: 6,  y: -22 }, // 기존
    { name: '군주의 격노',   x: -3, y: -25 }, // 신규
    { name: '불굴의 살해자', x: 3,  y: -28 }, // 신규
    { name: '전장의 심판',   x: 9,  y: -25 }, // 신규
  ],
  mage: [
    { name: '원소의 지배자', x: 13, y: -22 }, // 기존
    { name: '시공간 왜곡',   x: 19, y: -22 }, // 기존
    { name: '원소의 주재자', x: 10, y: -25 }, // 신규
    { name: '시간의 왜곡자', x: 16, y: -28 }, // 신규
    { name: '별의 파괴자',   x: 22, y: -25 }, // 신규
  ],
  cleric: [
    { name: '절대 신앙',     x: 26, y: -22 }, // 기존
    { name: '신의 심판',     x: 32, y: -22 }, // 기존
    { name: '성스러운 왕관', x: 23, y: -25 }, // 신규
    { name: '광채의 화신',   x: 29, y: -28 }, // 신규
    { name: '심판의 대천사', x: 35, y: -25 }, // 신규
  ],
  rogue: [
    { name: '그림자 왕',     x: 39, y: -22 }, // 기존
    { name: '맹독의 화신',   x: 45, y: -22 }, // 기존
    { name: '암흑의 귀환자', x: 36, y: -25 }, // 신규
    { name: '독 군주',       x: 42, y: -28 }, // 신규
    { name: '암살자의 진수', x: 48, y: -25 }, // 신규
  ],
};

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updated = 0;
    for (const [cls, nodes] of Object.entries(LAYOUT)) {
      for (const n of nodes) {
        const r = await client.query(
          `UPDATE node_definitions SET position_x=$1, position_y=$2
           WHERE tier='huge' AND class_exclusive=$3 AND name=$4 RETURNING id`,
          [n.x, n.y, cls, n.name]
        );
        if (r.rowCount > 0) { updated++; }
        else console.log(`  ⚠️ ${cls} ${n.name} 없음`);
      }
    }
    await client.query('COMMIT');
    console.log(`업데이트: ${updated}개`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // 검증: 거리 체크
  const v = await pool.query(
    `SELECT class_exclusive, name, position_x px, position_y py FROM node_definitions
     WHERE tier='huge' AND class_exclusive IN ('warrior','mage','cleric','rogue')
     ORDER BY class_exclusive, name`
  );
  const byClass = {};
  for (const r of v.rows) {
    if (!byClass[r.class_exclusive]) byClass[r.class_exclusive] = [];
    byClass[r.class_exclusive].push(r);
  }
  for (const [cls, list] of Object.entries(byClass)) {
    console.log(`\n[${cls}]`);
    for (const n of list) console.log(` ${n.name.padEnd(14)} (${n.px},${n.py})`);
    // 최소 거리
    let minDist = Infinity;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const d = Math.sqrt((list[i].px - list[j].px) ** 2 + (list[i].py - list[j].py) ** 2);
        if (d < minDist) minDist = d;
      }
    }
    console.log(`  최소 거리: ${minDist.toFixed(2)}`);
  }

  // 중복 체크
  const dup = await pool.query(
    `SELECT position_x, position_y, array_agg(name) FROM node_definitions
     WHERE tier='huge' GROUP BY position_x, position_y HAVING COUNT(*) > 1`
  );
  if (dup.rowCount > 0) console.log('\n⚠️ 중복:', dup.rows);
  else console.log('\n✓ 중복 없음');

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
