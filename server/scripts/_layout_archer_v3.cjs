// 궁수 노드 레이아웃 v3 — 다른 4직업과 동일 패턴
// 키스톤 5: 공유 5각형 perimeter 좌표 (0,-22), (21,-7), (13,18), (-13,18), (-21,-7)
// small/medium/large: 도적 클러스터(x=30..38, y=-15..-20) 와 동일 좌표 사용 (class_exclusive 로 안 겹침)

const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

const LAYOUT = []; // { id, x, y, prereq }

// ── core/huge (5) — 공유 5각형 perimeter ──
LAYOUT.push({ id: 1052, x: 0,    y: -22, prereq: [1049, 1050] }); // 궁수의 진수 (12시)
LAYOUT.push({ id: 1053, x: 21,   y: -7,  prereq: [1050]       }); // 끝없는 사거리 (3시)
LAYOUT.push({ id: 1054, x: 13,   y: 18,  prereq: [1051]       }); // 관통의 화신 (5시)
LAYOUT.push({ id: 1055, x: -13,  y: 18,  prereq: [1051, 1049] }); // 절대 정밀 (7시)
LAYOUT.push({ id: 1056, x: -21,  y: -7,  prereq: [1049]       }); // 저격수의 호흡 (9시)

// ── core/large (3) — 클러스터 위쪽 가로 row ──
LAYOUT.push({ id: 1049, x: 34, y: -20, prereq: [1041, 1042]              }); // 카이팅 마스터
LAYOUT.push({ id: 1050, x: 35, y: -20, prereq: [1037, 1038, 1039, 1040]  }); // 저격수 본능
LAYOUT.push({ id: 1051, x: 36, y: -20, prereq: [1043, 1044, 1046, 1047]  }); // 표적 마스터

// ── core/medium (12) — 클러스터 중간 row ──
LAYOUT.push({ id: 1037, x: 30, y: -18, prereq: [1018]      }); // DEX I  ← dex small 9
LAYOUT.push({ id: 1038, x: 31, y: -18, prereq: [1037]      }); // DEX II
LAYOUT.push({ id: 1039, x: 32, y: -18, prereq: [1027]      }); // CRI I  ← cri small 9
LAYOUT.push({ id: 1040, x: 33, y: -18, prereq: [1039]      }); // CRI II
LAYOUT.push({ id: 1041, x: 34, y: -18, prereq: [1036]      }); // SPD I  ← spd small 9
LAYOUT.push({ id: 1042, x: 35, y: -18, prereq: [1041]      }); // SPD II
LAYOUT.push({ id: 1043, x: 36, y: -18, prereq: [1038]      }); // 관통 강화
LAYOUT.push({ id: 1044, x: 37, y: -18, prereq: [1040]      }); // 치명데미지 강화
LAYOUT.push({ id: 1045, x: 30, y: -19, prereq: [1042]      }); // 다타 누적
LAYOUT.push({ id: 1046, x: 31, y: -19, prereq: [1038]      }); // 사거리 강화 I
LAYOUT.push({ id: 1047, x: 32, y: -19, prereq: [1040]      }); // 표적 추적
LAYOUT.push({ id: 1048, x: 33, y: -19, prereq: [1044]      }); // 도트 증폭

// ── core/small (27) — 3 row × 9 col, x=30..38 ──
// dex 1~9 (1010~1018) — y=-15
for (let i = 0; i < 9; i++) LAYOUT.push({ id: 1010 + i, x: 30 + i, y: -15, prereq: i === 0 ? [6] : [1010 + i - 1] });
// cri 1~9 (1019~1027) — y=-16
for (let i = 0; i < 9; i++) LAYOUT.push({ id: 1019 + i, x: 30 + i, y: -16, prereq: i === 0 ? [12] : [1019 + i - 1] });
// spd 1~9 (1028~1036) — y=-17
for (let i = 0; i < 9; i++) LAYOUT.push({ id: 1028 + i, x: 30 + i, y: -17, prereq: i === 0 ? [18] : [1028 + i - 1] });

// ── north_archer (분기) — 좌측 perimeter 영역 (북동/남서 외곽) ──
// north_archer/huge (3): keystone 사이 빈 자리에
LAYOUT.push({ id: 1102, x: -8, y: -22, prereq: [1095, 1101] }); // 정밀의 화신
LAYOUT.push({ id: 1103, x: 8,  y: -22, prereq: [1099, 1093] }); // 그림자 궁수
LAYOUT.push({ id: 1104, x: 0,  y: 22,  prereq: [1090, 1097] }); // 화살의 거장

// ── north_archer/large (12) — 외곽 ring ──
LAYOUT.push({ id: 1090, x: -10, y: -19, prereq: [1079] }); // 폭풍 사수
LAYOUT.push({ id: 1091, x: -8,  y: -19, prereq: [1077] }); // 천공의 화신
LAYOUT.push({ id: 1092, x: -6,  y: -19, prereq: [1078] }); // 관통의 군주
LAYOUT.push({ id: 1093, x: -4,  y: -19, prereq: [1080] }); // 바람의 군주
LAYOUT.push({ id: 1094, x: -2,  y: -19, prereq: [1087] }); // 표적 사냥꾼
LAYOUT.push({ id: 1095, x: 0,   y: -19, prereq: [1084] }); // 집중 호흡
LAYOUT.push({ id: 1096, x: 2,   y: -19, prereq: [1089] }); // 연쇄 사살
LAYOUT.push({ id: 1097, x: 4,   y: -19, prereq: [1090] }); // 폭격 모드
LAYOUT.push({ id: 1098, x: 6,   y: -19, prereq: [1092] }); // 심장 관통
LAYOUT.push({ id: 1099, x: 8,   y: -19, prereq: [1093] }); // 폭풍의 활
LAYOUT.push({ id: 1100, x: 10,  y: -19, prereq: [1094] }); // 죽음의 표적
LAYOUT.push({ id: 1101, x: 12,  y: -19, prereq: [1091] }); // 치명의 별

// ── north_archer/medium (13) — 중간 ring ──
LAYOUT.push({ id: 1077, x: -12, y: -17, prereq: [1063] }); // 저격수의 시야
LAYOUT.push({ id: 1078, x: -10, y: -17, prereq: [1077] }); // 관통의 비수
LAYOUT.push({ id: 1079, x: -8,  y: -17, prereq: [1078] }); // 폭격 가속
LAYOUT.push({ id: 1080, x: -6,  y: -17, prereq: [1076] }); // 추격자
LAYOUT.push({ id: 1081, x: -4,  y: -17, prereq: [1080] }); // 약점 분석
LAYOUT.push({ id: 1082, x: -2,  y: -17, prereq: [1081] }); // 인내의 화살
LAYOUT.push({ id: 1083, x: 0,   y: -17, prereq: [1082] }); // 도트 마스터
LAYOUT.push({ id: 1084, x: 2,   y: -17, prereq: [1077] }); // 연계 사격
LAYOUT.push({ id: 1085, x: 4,   y: -17, prereq: [1079] }); // 사거리 확장
LAYOUT.push({ id: 1086, x: 6,   y: -17, prereq: [1070] }); // 바람의 의지
LAYOUT.push({ id: 1087, x: 8,   y: -17, prereq: [1086] }); // 표적의 별
LAYOUT.push({ id: 1088, x: 10,  y: -17, prereq: [1077] }); // 폭주 화살
LAYOUT.push({ id: 1089, x: 12,  y: -17, prereq: [1085] }); // 끝없는 활시위

// ── north_archer/small (20) — 분기 root row ──
// 정밀(cri) 1~7 (1057~1063): y = -15
for (let i = 0; i < 7; i++) LAYOUT.push({ id: 1057 + i, x: -12 + i * 2, y: -15, prereq: i === 0 ? [1027] : [1057 + i - 1] });
// 민첩(dex) 1~7 (1064~1070): y = -14
for (let i = 0; i < 7; i++) LAYOUT.push({ id: 1064 + i, x: -12 + i * 2, y: -14, prereq: i === 0 ? [1018] : [1064 + i - 1] });
// 속도(spd) 1~6 (1071~1076): y = -13
for (let i = 0; i < 6; i++) LAYOUT.push({ id: 1071 + i, x: -12 + i * 2, y: -13, prereq: i === 0 ? [1036] : [1071 + i - 1] });

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
    console.log(`OK ${updated}개 노드 v3 레이아웃·prereq 갱신`);
    const r = await c.query(`SELECT zone, MIN(position_x) AS minx, MAX(position_x) AS maxx, MIN(position_y) AS miny, MAX(position_y) AS maxy, COUNT(*) AS cnt FROM node_definitions WHERE class_exclusive='archer' GROUP BY zone`);
    console.log('archer 위치 범위:');
    for (const row of r.rows) console.log(`  ${row.zone}: x ${row.minx}~${row.maxx}, y ${row.miny}~${row.maxy} (${row.cnt}개)`);
    const huges = await c.query(`SELECT id, name, position_x AS x, position_y AS y FROM node_definitions WHERE class_exclusive='archer' AND tier='huge' ORDER BY id`);
    console.log('\n키스톤 시계방향 perimeter 배치:');
    for (const row of huges.rows) console.log(`  #${row.id} (${row.x}, ${row.y}) ${row.name}`);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
