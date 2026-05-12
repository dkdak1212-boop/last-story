// 궁수 노드 레이아웃 + prereq 재구성
// 타 직업과 겹치지 않는 우측 영역 (x=40~50) 에 격자 배치.
// 같은 카테고리(스탯) 같은 tier 안에서 chain 연결, 첫 노드는 공용 anchor 1번에 연결.

const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

// 노드 id 1010 ~ 1104 (95개) 좌표/prereq 매핑
// 정렬 순서는 _seed_archer_nodes.cjs 의 add() 순서와 일치.
const LAYOUT = []; // { id, x, y, prereq }

let id = 1010;

// ── core/small (27): 3 row × 9 col, y -15/-14/-13 ──
// dex 1~9 (id 1010~1018) — y=-15
for (let i = 0; i < 9; i++) LAYOUT.push({ id: 1010 + i, x: 40 + i, y: -15, prereq: i === 0 ? [1] : [1010 + i - 1] });
// cri 1~9 (1019~1027) — y=-14
for (let i = 0; i < 9; i++) LAYOUT.push({ id: 1019 + i, x: 40 + i, y: -14, prereq: i === 0 ? [1] : [1019 + i - 1] });
// spd 1~9 (1028~1036) — y=-13
for (let i = 0; i < 9; i++) LAYOUT.push({ id: 1028 + i, x: 40 + i, y: -13, prereq: i === 0 ? [1] : [1028 + i - 1] });

// ── core/medium (12): id 1037~1048, y=-11..-10 ──
// 1037 DEX I, 1038 DEX II, 1039 CRI I, 1040 CRI II, 1041 SPD I, 1042 SPD II,
// 1043 관통 강화, 1044 치명데미지 강화, 1045 다타누적 강화,
// 1046 사거리 강화 I, 1047 표적 추적, 1048 도트 증폭
const mediumLayout = [
  { id: 1037, x: 40, y: -11, prereq: [1018] }, // DEX I ← dex9
  { id: 1038, x: 41, y: -11, prereq: [1037] }, // DEX II
  { id: 1039, x: 42, y: -11, prereq: [1027] }, // CRI I ← cri9
  { id: 1040, x: 43, y: -11, prereq: [1039] }, // CRI II
  { id: 1041, x: 44, y: -11, prereq: [1036] }, // SPD I ← spd9
  { id: 1042, x: 45, y: -11, prereq: [1041] }, // SPD II
  { id: 1043, x: 40, y: -10, prereq: [1038] }, // 관통 강화
  { id: 1044, x: 41, y: -10, prereq: [1040] }, // 치명데미지 강화
  { id: 1045, x: 42, y: -10, prereq: [1042] }, // 다타 누적
  { id: 1046, x: 43, y: -10, prereq: [1038] }, // 사거리 강화 I
  { id: 1047, x: 44, y: -10, prereq: [1040] }, // 표적 추적
  { id: 1048, x: 45, y: -10, prereq: [1044] }, // 도트 증폭
];
LAYOUT.push(...mediumLayout);

// ── core/large (3): id 1049~1051, y=-8 ──
LAYOUT.push({ id: 1049, x: 41, y: -8, prereq: [1042, 1041] }); // 카이팅 마스터
LAYOUT.push({ id: 1050, x: 43, y: -8, prereq: [1040, 1044] }); // 저격수 본능
LAYOUT.push({ id: 1051, x: 45, y: -8, prereq: [1047, 1046] }); // 표적 마스터

// ── core/huge (5): id 1052~1056, y=-6 ──
LAYOUT.push({ id: 1052, x: 40, y: -6, prereq: [1049] }); // 궁수의 진수
LAYOUT.push({ id: 1053, x: 42, y: -6, prereq: [1046] }); // 끝없는 사거리
LAYOUT.push({ id: 1054, x: 44, y: -6, prereq: [1043] }); // 관통의 화신
LAYOUT.push({ id: 1055, x: 46, y: -6, prereq: [1050] }); // 절대 정밀
LAYOUT.push({ id: 1056, x: 48, y: -6, prereq: [1051] }); // 저격수의 호흡

// ── north_archer/small (20): id 1057~1076 — 7 cri + 7 dex + 6 spd ──
// 정밀(cri) 1~7 (1057~1063): y=2
for (let i = 0; i < 7; i++) LAYOUT.push({ id: 1057 + i, x: 40 + i, y: 2, prereq: i === 0 ? [1052] : [1057 + i - 1] });
// 민첩(dex) 1~7 (1064~1070): y=3
for (let i = 0; i < 7; i++) LAYOUT.push({ id: 1064 + i, x: 40 + i, y: 3, prereq: i === 0 ? [1054] : [1064 + i - 1] });
// 속도(spd) 1~6 (1071~1076): y=4
for (let i = 0; i < 6; i++) LAYOUT.push({ id: 1071 + i, x: 40 + i, y: 4, prereq: i === 0 ? [1056] : [1071 + i - 1] });

// ── north_archer/medium (13): id 1077~1089, y=6..7 ──
LAYOUT.push({ id: 1077, x: 40, y: 6, prereq: [1063] });        // 저격수의 시야 ← 정밀7
LAYOUT.push({ id: 1078, x: 41, y: 6, prereq: [1077] });        // 관통의 비수
LAYOUT.push({ id: 1079, x: 42, y: 6, prereq: [1078] });        // 폭격 가속
LAYOUT.push({ id: 1080, x: 43, y: 6, prereq: [1076] });        // 추격자 ← 속도6
LAYOUT.push({ id: 1081, x: 44, y: 6, prereq: [1080] });        // 약점 분석
LAYOUT.push({ id: 1082, x: 45, y: 6, prereq: [1081] });        // 인내의 화살
LAYOUT.push({ id: 1083, x: 46, y: 6, prereq: [1082] });        // 도트 마스터
LAYOUT.push({ id: 1084, x: 40, y: 7, prereq: [1077] });        // 연계 사격
LAYOUT.push({ id: 1085, x: 41, y: 7, prereq: [1079] });        // 사거리 확장
LAYOUT.push({ id: 1086, x: 42, y: 7, prereq: [1070] });        // 바람의 의지 ← 민첩7
LAYOUT.push({ id: 1087, x: 43, y: 7, prereq: [1086] });        // 표적의 별
LAYOUT.push({ id: 1088, x: 44, y: 7, prereq: [1077] });        // 폭주 화살
LAYOUT.push({ id: 1089, x: 45, y: 7, prereq: [1085] });        // 끝없는 활시위

// ── north_archer/large (12): id 1090~1101, y=9..10 ──
LAYOUT.push({ id: 1090, x: 40, y: 9, prereq: [1079] }); // 폭풍 사수
LAYOUT.push({ id: 1091, x: 41, y: 9, prereq: [1077] }); // 천공의 화신
LAYOUT.push({ id: 1092, x: 42, y: 9, prereq: [1078] }); // 관통의 군주
LAYOUT.push({ id: 1093, x: 43, y: 9, prereq: [1080] }); // 바람의 군주
LAYOUT.push({ id: 1094, x: 44, y: 9, prereq: [1087] }); // 표적 사냥꾼
LAYOUT.push({ id: 1095, x: 45, y: 9, prereq: [1084] }); // 집중 호흡
LAYOUT.push({ id: 1096, x: 46, y: 9, prereq: [1089] }); // 연쇄 사살
LAYOUT.push({ id: 1097, x: 40, y: 10, prereq: [1090] }); // 폭격 모드
LAYOUT.push({ id: 1098, x: 41, y: 10, prereq: [1092] }); // 심장 관통
LAYOUT.push({ id: 1099, x: 42, y: 10, prereq: [1093] }); // 폭풍의 활
LAYOUT.push({ id: 1100, x: 43, y: 10, prereq: [1094] }); // 죽음의 표적
LAYOUT.push({ id: 1101, x: 44, y: 10, prereq: [1091] }); // 치명의 별

// ── north_archer/huge (3): id 1102~1104, y=12 ──
LAYOUT.push({ id: 1102, x: 41, y: 12, prereq: [1095, 1101] }); // 정밀의 화신
LAYOUT.push({ id: 1103, x: 43, y: 12, prereq: [1099, 1093] }); // 그림자 궁수
LAYOUT.push({ id: 1104, x: 45, y: 12, prereq: [1090, 1097] }); // 화살의 거장

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    let updated = 0;
    for (const l of LAYOUT) {
      const r = await c.query(
        `UPDATE node_definitions SET position_x=$1, position_y=$2, prerequisites=$3 WHERE id=$4`,
        [l.x, l.y, l.prereq, l.id]
      );
      if (r.rowCount > 0) updated++;
    }
    console.log(`OK ${updated}개 노드 레이아웃·prereq 갱신 완료`);
    // 검증
    const r = await c.query(`SELECT zone, MIN(position_x) AS minx, MAX(position_x) AS maxx, MIN(position_y) AS miny, MAX(position_y) AS maxy FROM node_definitions WHERE class_exclusive='archer' GROUP BY zone`);
    console.log('archer 위치 범위:');
    for (const row of r.rows) console.log(`  ${row.zone}: x ${row.minx}~${row.maxx}, y ${row.miny}~${row.maxy}`);
    const sample = await c.query(`SELECT id, name, position_x, position_y, prerequisites FROM node_definitions WHERE class_exclusive='archer' AND tier='huge' ORDER BY id`);
    console.log('\nhuge 노드 (키스톤) 위치·prereq:');
    for (const row of sample.rows) console.log(`  #${row.id} (${row.position_x},${row.position_y}) ${row.name} prereq=[${row.prerequisites.join(',')}]`);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
