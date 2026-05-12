// 궁수 노드 레이아웃 v4 — 소환사 동심원 패턴
// 8 huge perimeter / 15 large 외곽 ring / 25 medium 중간 ring / 47 small 내부
// 단일 zone='archer' 로 통합 (기존 core + north_archer 합침)

const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

const LAYOUT = []; // { id, x, y, prereq, tier, zone }

// ── 8 huge 키스톤 — 8각형 perimeter at radius 17 ──
// 시계방향 12시부터: 12, 1.5, 3, 4.5, 6, 7.5, 9, 10.5
const HUGE_POSITIONS = [
  [0, -17],   // 12시 — 궁수의 진수
  [12, -12],  // 1:30 — 그림자 궁수
  [17, 0],    // 3시 — 끝없는 사거리
  [12, 12],   // 4:30 — 관통의 화신
  [0, 17],    // 6시 — 화살의 거장
  [-12, 12],  // 7:30 — 절대 정밀
  [-17, 0],   // 9시 — 저격수의 호흡
  [-12, -12], // 10:30 — 정밀의 화신
];
const HUGE_IDS = [1052, 1103, 1053, 1054, 1104, 1055, 1056, 1102];
for (let i = 0; i < 8; i++) {
  LAYOUT.push({ id: HUGE_IDS[i], x: HUGE_POSITIONS[i][0], y: HUGE_POSITIONS[i][1], tier: 'huge', zone: 'archer', prereq: [] });
}

// ── 15 large — 외곽 ring at radius 13~14 ──
// large id (3 from core + 12 from north_archer = 15): 1049, 1050, 1051, 1090..1101
const LARGE_IDS = [1049, 1050, 1051, 1090, 1091, 1092, 1093, 1094, 1095, 1096, 1097, 1098, 1099, 1100, 1101];
const LARGE_POS = [
  [0, -14], [5, -13], [10, -10], [13, -5], [14, 0], [13, 5], [10, 10], [5, 13],
  [0, 14], [-5, 13], [-10, 10], [-13, 5], [-14, 0], [-13, -5], [-10, -10],
];
for (let i = 0; i < 15; i++) {
  LAYOUT.push({ id: LARGE_IDS[i], x: LARGE_POS[i][0], y: LARGE_POS[i][1], tier: 'large', zone: 'archer', prereq: [] });
}

// ── 25 medium — 중간 ring at radius 8~10 ──
// medium id (12 from core + 13 from north_archer = 25)
const MEDIUM_IDS = [1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089];
const MEDIUM_POS = [];
// 25 균등 분포 — 360°/25 ≈ 14.4° 간격
for (let i = 0; i < 25; i++) {
  const angle = (i / 25) * Math.PI * 2 - Math.PI / 2;
  const r = 9;
  MEDIUM_POS.push([Math.round(Math.cos(angle) * r), Math.round(Math.sin(angle) * r)]);
}
for (let i = 0; i < 25; i++) {
  LAYOUT.push({ id: MEDIUM_IDS[i], x: MEDIUM_POS[i][0], y: MEDIUM_POS[i][1], tier: 'medium', zone: 'archer', prereq: [] });
}

// ── 47 small — 내부 ring at radius 4~6 ──
// small id (27 from core + 20 from north_archer = 47)
const SMALL_IDS_CORE = [];
for (let i = 1010; i <= 1036; i++) SMALL_IDS_CORE.push(i); // 27개
const SMALL_IDS_NORTH = [];
for (let i = 1057; i <= 1076; i++) SMALL_IDS_NORTH.push(i); // 20개
const SMALL_IDS = [...SMALL_IDS_CORE, ...SMALL_IDS_NORTH];

// 47 균등 분포 — 안쪽 r=4 (24개) + 바깥 r=6 (23개) 두 ring
const SMALL_POS = [];
for (let i = 0; i < 24; i++) {
  const angle = (i / 24) * Math.PI * 2 - Math.PI / 2;
  SMALL_POS.push([Math.round(Math.cos(angle) * 4), Math.round(Math.sin(angle) * 4)]);
}
for (let i = 0; i < 23; i++) {
  const angle = (i / 23) * Math.PI * 2 - Math.PI / 2 + Math.PI / 23;
  SMALL_POS.push([Math.round(Math.cos(angle) * 6), Math.round(Math.sin(angle) * 6)]);
}
for (let i = 0; i < 47; i++) {
  LAYOUT.push({ id: SMALL_IDS[i], x: SMALL_POS[i][0], y: SMALL_POS[i][1], tier: 'small', zone: 'archer', prereq: [] });
}

// ── prereq 체인: 안쪽→바깥쪽 단계적 ──
// small 안쪽 24개: 첫 번째는 공용 #1, 나머지는 이전 small (원형 chain)
// small 바깥쪽 23개: 안쪽 인접 small 에 연결
// medium: 가장 가까운 small 에 연결
// large: 가장 가까운 medium 에 연결
// huge: 가장 가까운 large 1개 + 인접 large 1개 (2개) 에 연결
function dist2(a, b) { return (a[0]-b[0])**2 + (a[1]-b[1])**2; }
function nearestN(target, candidates, n) {
  return candidates.map((c, i) => ({ i, d: dist2(target, c) })).sort((a, b) => a.d - b.d).slice(0, n);
}

// small 안쪽 24개 (LAYOUT idx 23~46)
const innerSmallStart = 8 + 15 + 25; // 48
const innerSmallEnd = innerSmallStart + 24; // 72
for (let i = innerSmallStart; i < innerSmallEnd; i++) {
  if (i === innerSmallStart) LAYOUT[i].prereq = [1]; // 공용 #1 anchor
  else LAYOUT[i].prereq = [LAYOUT[i - 1].id];
}
// small 바깥쪽 23개 (LAYOUT idx 72~94)
const outerSmallStart = innerSmallEnd;
const outerSmallEnd = outerSmallStart + 23;
for (let i = outerSmallStart; i < outerSmallEnd; i++) {
  // 가장 가까운 안쪽 small 에 연결
  const target = [LAYOUT[i].x, LAYOUT[i].y];
  let bestIdx = innerSmallStart;
  let bestD = Infinity;
  for (let j = innerSmallStart; j < innerSmallEnd; j++) {
    const d = dist2(target, [LAYOUT[j].x, LAYOUT[j].y]);
    if (d < bestD) { bestD = d; bestIdx = j; }
  }
  LAYOUT[i].prereq = [LAYOUT[bestIdx].id];
}

// medium (LAYOUT idx 23~47): 가장 가까운 small 1개에 연결
const mediumStart = 8 + 15;
const mediumEnd = mediumStart + 25;
for (let i = mediumStart; i < mediumEnd; i++) {
  const target = [LAYOUT[i].x, LAYOUT[i].y];
  let bestIdx = innerSmallStart;
  let bestD = Infinity;
  for (let j = innerSmallStart; j < outerSmallEnd; j++) {
    const d = dist2(target, [LAYOUT[j].x, LAYOUT[j].y]);
    if (d < bestD) { bestD = d; bestIdx = j; }
  }
  LAYOUT[i].prereq = [LAYOUT[bestIdx].id];
}

// large (LAYOUT idx 8~22): 가장 가까운 medium 2개에 연결
const largeStart = 8;
const largeEnd = largeStart + 15;
for (let i = largeStart; i < largeEnd; i++) {
  const target = [LAYOUT[i].x, LAYOUT[i].y];
  const candidates = [];
  for (let j = mediumStart; j < mediumEnd; j++) {
    candidates.push({ id: LAYOUT[j].id, d: dist2(target, [LAYOUT[j].x, LAYOUT[j].y]) });
  }
  candidates.sort((a, b) => a.d - b.d);
  LAYOUT[i].prereq = candidates.slice(0, 2).map(c => c.id);
}

// huge (LAYOUT idx 0~7): 가장 가까운 large 1~2개
for (let i = 0; i < 8; i++) {
  const target = [LAYOUT[i].x, LAYOUT[i].y];
  const candidates = [];
  for (let j = largeStart; j < largeEnd; j++) {
    candidates.push({ id: LAYOUT[j].id, d: dist2(target, [LAYOUT[j].x, LAYOUT[j].y]) });
  }
  candidates.sort((a, b) => a.d - b.d);
  LAYOUT[i].prereq = candidates.slice(0, 2).map(c => c.id);
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
    console.log(`OK ${updated}개 노드 v4 (소환사 동심원 패턴) 갱신`);
    const r = await c.query(`SELECT zone, tier, COUNT(*) AS cnt FROM node_definitions WHERE class_exclusive='archer' GROUP BY zone, tier ORDER BY zone, tier`);
    console.log('archer zone/tier 분포:');
    for (const row of r.rows) console.log(`  ${row.zone}/${row.tier}: ${row.cnt}개`);
    const huges = await c.query(`SELECT id, name, position_x AS x, position_y AS y, prerequisites FROM node_definitions WHERE class_exclusive='archer' AND tier='huge' ORDER BY position_y, position_x`);
    console.log('\n8 키스톤 시계방향 perimeter:');
    for (const row of huges.rows) console.log(`  #${row.id} (${row.x},${row.y}) ${row.name} prereq=[${row.prerequisites.join(',')}]`);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
