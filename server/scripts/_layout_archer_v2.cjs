// 궁수 노드 레이아웃 v2 — 5각형 시계방향 키스톤 + 다층 spoke 연결
// 중심 (50,0) 주변에 핵심 5 키스톤(8 코스트) 시계방향 배치, 안쪽으로 large/medium/small 단계.

const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

const LAYOUT = []; // { id, x, y, prereq }

// ── core/huge (5 키스톤) — 시계방향 12시부터 ──
// 1052 궁수의 진수 (12시), 1053 끝없는 사거리 (3시 부근), 1054 관통의 화신 (4-5시),
// 1055 절대 정밀 (7-8시), 1056 저격수의 호흡 (9-10시)
LAYOUT.push({ id: 1052, x: 50,  y: -20, prereq: [1049, 1050] }); // 12시
LAYOUT.push({ id: 1053, x: 68,  y: -6,  prereq: [1050]       }); // 3시
LAYOUT.push({ id: 1054, x: 60,  y: 16,  prereq: [1051]       }); // 4-5시
LAYOUT.push({ id: 1055, x: 40,  y: 16,  prereq: [1051, 1049] }); // 7-8시
LAYOUT.push({ id: 1056, x: 32,  y: -6,  prereq: [1049]       }); // 9-10시

// ── core/large (3) — 키스톤 안쪽 삼각형 ──
LAYOUT.push({ id: 1049, x: 40, y: -10, prereq: [1037, 1038, 1041] }); // 카이팅 마스터 (좌상)
LAYOUT.push({ id: 1050, x: 60, y: -10, prereq: [1038, 1039, 1040] }); // 저격수 본능 (우상)
LAYOUT.push({ id: 1051, x: 50, y: 8,   prereq: [1043, 1046, 1047] }); // 표적 마스터 (하)

// ── core/medium (12) — large 주변 ring ──
LAYOUT.push({ id: 1037, x: 38, y: -6, prereq: [1018]       }); // DEX I ← 작은 dex9
LAYOUT.push({ id: 1038, x: 42, y: -6, prereq: [1037]       }); // DEX II
LAYOUT.push({ id: 1041, x: 36, y: -3, prereq: [1036]       }); // SPD I ← 작은 spd9
LAYOUT.push({ id: 1042, x: 36, y: 0,  prereq: [1041]       }); // SPD II
LAYOUT.push({ id: 1039, x: 58, y: -6, prereq: [1027]       }); // CRI I ← 작은 cri9
LAYOUT.push({ id: 1040, x: 62, y: -6, prereq: [1039]       }); // CRI II
LAYOUT.push({ id: 1043, x: 46, y: 6,  prereq: [1038]       }); // 관통 강화
LAYOUT.push({ id: 1044, x: 54, y: 6,  prereq: [1040]       }); // 치명데미지 강화
LAYOUT.push({ id: 1045, x: 50, y: 4,  prereq: [1042]       }); // 다타 누적
LAYOUT.push({ id: 1046, x: 48, y: 8,  prereq: [1043]       }); // 사거리 강화 I
LAYOUT.push({ id: 1047, x: 52, y: 8,  prereq: [1044]       }); // 표적 추적
LAYOUT.push({ id: 1048, x: 50, y: 10, prereq: [1045]       }); // 도트 증폭

// ── core/small (27) — 안쪽 동심원 ──
// dex 1~9 (1010~1018): 좌측 세로 라인
for (let i = 0; i < 9; i++) LAYOUT.push({ id: 1010 + i, x: 40, y: -2 + i, prereq: i === 0 ? [1] : [1010 + i - 1] });
// cri 1~9 (1019~1027): 우측 세로 라인
for (let i = 0; i < 9; i++) LAYOUT.push({ id: 1019 + i, x: 60, y: -2 + i, prereq: i === 0 ? [1] : [1019 + i - 1] });
// spd 1~9 (1028~1036): 중앙 가로 라인
for (let i = 0; i < 9; i++) LAYOUT.push({ id: 1028 + i, x: 42 + i * 2, y: -2, prereq: i === 0 ? [1] : [1028 + i - 1] });

// ── north_archer/huge (3 분기 키스톤) — 우측 별도 영역 ──
LAYOUT.push({ id: 1102, x: 80, y: 0,  prereq: [1095, 1101] }); // 정밀의 화신
LAYOUT.push({ id: 1103, x: 80, y: 8,  prereq: [1099, 1093] }); // 그림자 궁수
LAYOUT.push({ id: 1104, x: 80, y: -8, prereq: [1090, 1097] }); // 화살의 거장

// ── north_archer/large (12) — 분기 안쪽 ──
LAYOUT.push({ id: 1090, x: 76, y: -10, prereq: [1079] });  // 폭풍 사수
LAYOUT.push({ id: 1091, x: 76, y: -8,  prereq: [1077] });  // 천공의 화신
LAYOUT.push({ id: 1092, x: 76, y: -6,  prereq: [1078] });  // 관통의 군주
LAYOUT.push({ id: 1093, x: 76, y: -4,  prereq: [1080] });  // 바람의 군주
LAYOUT.push({ id: 1094, x: 76, y: -2,  prereq: [1087] });  // 표적 사냥꾼
LAYOUT.push({ id: 1095, x: 76, y: 0,   prereq: [1084] });  // 집중 호흡
LAYOUT.push({ id: 1096, x: 76, y: 2,   prereq: [1089] });  // 연쇄 사살
LAYOUT.push({ id: 1097, x: 76, y: 4,   prereq: [1090] });  // 폭격 모드
LAYOUT.push({ id: 1098, x: 76, y: 6,   prereq: [1092] });  // 심장 관통
LAYOUT.push({ id: 1099, x: 76, y: 8,   prereq: [1093] });  // 폭풍의 활
LAYOUT.push({ id: 1100, x: 76, y: 10,  prereq: [1094] });  // 죽음의 표적
LAYOUT.push({ id: 1101, x: 76, y: 12,  prereq: [1091] });  // 치명의 별

// ── north_archer/medium (13) — 더 안쪽 ──
LAYOUT.push({ id: 1077, x: 72, y: -8, prereq: [1063] }); // 저격수의 시야
LAYOUT.push({ id: 1078, x: 72, y: -6, prereq: [1077] }); // 관통의 비수
LAYOUT.push({ id: 1079, x: 72, y: -4, prereq: [1078] }); // 폭격 가속
LAYOUT.push({ id: 1080, x: 72, y: -2, prereq: [1076] }); // 추격자
LAYOUT.push({ id: 1081, x: 72, y: 0,  prereq: [1080] }); // 약점 분석
LAYOUT.push({ id: 1082, x: 72, y: 2,  prereq: [1081] }); // 인내의 화살
LAYOUT.push({ id: 1083, x: 72, y: 4,  prereq: [1082] }); // 도트 마스터
LAYOUT.push({ id: 1084, x: 72, y: 6,  prereq: [1077] }); // 연계 사격
LAYOUT.push({ id: 1085, x: 72, y: 8,  prereq: [1079] }); // 사거리 확장
LAYOUT.push({ id: 1086, x: 72, y: 10, prereq: [1070] }); // 바람의 의지
LAYOUT.push({ id: 1087, x: 72, y: 12, prereq: [1086] }); // 표적의 별
LAYOUT.push({ id: 1088, x: 70, y: 14, prereq: [1077] }); // 폭주 화살
LAYOUT.push({ id: 1089, x: 74, y: 14, prereq: [1085] }); // 끝없는 활시위

// ── north_archer/small (20) — 분기 root ──
// 정밀 1~7 (1057~1063): 분기 첫 row (cri 끝 #1027 에서 분기)
for (let i = 0; i < 7; i++) LAYOUT.push({ id: 1057 + i, x: 64 + i, y: -8, prereq: i === 0 ? [1027] : [1057 + i - 1] });
// 민첩 1~7 (1064~1070): 분기 둘째 row (dex 끝 #1018 에서 분기)
for (let i = 0; i < 7; i++) LAYOUT.push({ id: 1064 + i, x: 64 + i, y: -6, prereq: i === 0 ? [1018] : [1064 + i - 1] });
// 속도 1~6 (1071~1076): 분기 셋째 row (spd 끝 #1036 에서 분기)
for (let i = 0; i < 6; i++) LAYOUT.push({ id: 1071 + i, x: 64 + i, y: -4, prereq: i === 0 ? [1036] : [1071 + i - 1] });

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
    console.log(`OK ${updated}개 노드 v2 레이아웃·prereq 갱신 완료`);
    const r = await c.query(`SELECT zone, MIN(position_x) AS minx, MAX(position_x) AS maxx, MIN(position_y) AS miny, MAX(position_y) AS maxy, COUNT(*) AS cnt FROM node_definitions WHERE class_exclusive='archer' GROUP BY zone`);
    console.log('archer 위치 범위:');
    for (const row of r.rows) console.log(`  ${row.zone}: x ${row.minx}~${row.maxx}, y ${row.miny}~${row.maxy} (${row.cnt}개)`);
    const huges = await c.query(`SELECT id, name, position_x AS x, position_y AS y, prerequisites FROM node_definitions WHERE class_exclusive='archer' AND tier='huge' ORDER BY id`);
    console.log('\n키스톤 시계방향 배치:');
    for (const row of huges.rows) console.log(`  #${row.id} (${row.x},${row.y}) ${row.name} prereq=[${row.prerequisites.join(',')}]`);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
