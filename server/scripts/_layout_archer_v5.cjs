// 궁수 노드 레이아웃 v5 — 소환사식 8 spoke 방사형 별
// 8 방향으로 spoke 형성, 각 spoke 끝에 huge 키스톤
// 각 spoke: small 6 (or 5) → medium 3 → large 2 → huge 1
// spoke 간 large·medium tier 에서 cross-connect

const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

const LAYOUT = []; // { id, x, y, prereq, tier, zone }

const HUGE_IDS = [1052, 1103, 1053, 1054, 1104, 1055, 1056, 1102];
// 8 huge 이름: 궁수의 진수, 그림자 궁수, 끝없는 사거리, 관통의 화신, 화살의 거장, 절대 정밀, 저격수의 호흡, 정밀의 화신

// 8 spoke 방향 (radians) — 12시부터 시계방향
const ANGLES = [];
for (let i = 0; i < 8; i++) ANGLES.push(-Math.PI / 2 + (i * 2 * Math.PI / 8));

function pos(angle, r) { return [Math.round(Math.cos(angle) * r), Math.round(Math.sin(angle) * r)]; }

// small id pool: 27 (core) + 20 (north) = 47
const SMALL_POOL = [];
for (let i = 1010; i <= 1036; i++) SMALL_POOL.push(i);
for (let i = 1057; i <= 1076; i++) SMALL_POOL.push(i);

// medium id pool: 12 + 13 = 25
const MEDIUM_POOL = [];
for (let i = 1037; i <= 1048; i++) MEDIUM_POOL.push(i);
for (let i = 1077; i <= 1089; i++) MEDIUM_POOL.push(i);

// large id pool: 3 + 12 = 15
const LARGE_POOL = [1049, 1050, 1051];
for (let i = 1090; i <= 1101; i++) LARGE_POOL.push(i);

// 8 spoke 분배: 각 spoke 에 small N개 + medium 3 + large 2 + huge 1
// 47 smalls / 8 = 5.875 → 7 spoke 에 6개, 1 spoke 에 5개 (5.875 평균)
// 25 medium / 8 = 3.125 → 7 spoke 에 3개, 1 spoke 에 4개
// 15 large / 8 = 1.875 → 7 spoke 에 2개, 1 spoke 에 1개
// 8 huge — 각 spoke 1개씩

let smallIdx = 0, mediumIdx = 0, largeIdx = 0;
const spokeNodes = []; // spokeNodes[s] = { smalls: [ids], mediums, larges, huge }

for (let s = 0; s < 8; s++) {
  const node = { spoke: s, angle: ANGLES[s], smalls: [], mediums: [], larges: [], huge: HUGE_IDS[s] };
  // small 분배
  const smallCount = s < 7 ? 6 : 5;
  for (let k = 0; k < smallCount; k++) node.smalls.push(SMALL_POOL[smallIdx++]);
  // medium 분배
  const mediumCount = s < 7 ? 3 : 4;
  for (let k = 0; k < mediumCount; k++) node.mediums.push(MEDIUM_POOL[mediumIdx++]);
  // large 분배
  const largeCount = s < 7 ? 2 : 1;
  for (let k = 0; k < largeCount; k++) node.larges.push(LARGE_POOL[largeIdx++]);
  spokeNodes.push(node);
}

// ── 좌표 + prereq 계산 ──
for (const sn of spokeNodes) {
  const { angle, smalls, mediums, larges, huge } = sn;

  // small: r=2, 4, 6, 8, 10, 12 (or 5개면 2,4,6,8,10)
  for (let i = 0; i < smalls.length; i++) {
    const [x, y] = pos(angle, 2 + i * 2);
    const prereq = i === 0 ? [1] : [smalls[i - 1]]; // 첫 small 은 공용 #1, 나머지는 spoke 안 chain
    LAYOUT.push({ id: smalls[i], x, y, tier: 'small', zone: 'archer', prereq });
  }
  // medium: small 끝에서 더 바깥. r=14, 15, 16
  for (let i = 0; i < mediums.length; i++) {
    const r = 13 + i;
    const [x, y] = pos(angle, r);
    const prereq = i === 0 ? [smalls[smalls.length - 1]] : [mediums[i - 1]];
    LAYOUT.push({ id: mediums[i], x, y, tier: 'medium', zone: 'archer', prereq });
  }
  // large: medium 끝에서 더 바깥. r=17, 18 (or 1개만 17)
  for (let i = 0; i < larges.length; i++) {
    const r = 17 + i;
    const [x, y] = pos(angle, r);
    const prereq = i === 0 ? [mediums[mediums.length - 1]] : [larges[i - 1]];
    LAYOUT.push({ id: larges[i], x, y, tier: 'large', zone: 'archer', prereq });
  }
  // huge: spoke tip r=20
  const [hx, hy] = pos(angle, 20);
  LAYOUT.push({ id: huge, x: hx, y: hy, tier: 'huge', zone: 'archer', prereq: [larges[larges.length - 1]] });
}

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    let updated = 0;
    for (const l of LAYOUT) {
      const r = await c.query(
        `UPDATE node_definitions SET position_x=$1, position_y=$2, prerequisites=$3, zone=$4 WHERE id=$5`,
        [l.x, l.y, l.prereq, l.zone, l.id]
      );
      if (r.rowCount > 0) updated++;
    }
    console.log(`OK ${updated}개 노드 v5 (8 spoke 방사형) 갱신`);
    const r = await c.query(`SELECT zone, tier, COUNT(*) AS cnt FROM node_definitions WHERE class_exclusive='archer' GROUP BY zone, tier ORDER BY zone, tier`);
    console.log('archer zone/tier 분포:');
    for (const row of r.rows) console.log(`  ${row.zone}/${row.tier}: ${row.cnt}개`);

    // spoke별 검증
    console.log('\n8 spoke 별 huge 위치:');
    const huges = await c.query(`SELECT id, name, position_x AS x, position_y AS y FROM node_definitions WHERE class_exclusive='archer' AND tier='huge' ORDER BY id`);
    for (const row of huges.rows) console.log(`  #${row.id} (${row.x},${row.y}) ${row.name}`);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
