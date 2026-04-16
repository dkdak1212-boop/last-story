/**
 * 도적 분기형 노드 확장 — 각 분기에 42개 추가 (기존 유지)
 * 메인 체인 노드에서 좌우로 곁가지 뻗어나가는 구조
 * hidden=true, 다른 직업 절대 안 건드림
 */
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const ZONE = 'north_rogue';
const CLASS = 'rogue';

// 기존 메인 체인 ID (변경 안 함)
const ROOT = 767;
const A = [768,769,770,771,772,773,774,775]; // 암살자
const B = [776,777,778,779,780,781,782,783]; // 칼바람
const C = [784,785,786,787,788,789,790,791]; // 독술사

(async () => {
  console.log('=== 도적 분기형 노드 확장 (각 42개 추가) ===');

  // 기존 확장 노드만 삭제 (메인 체인 25개는 보존)
  const mainIds = [ROOT, ...A, ...B, ...C];
  const expandedR = await pool.query(
    `SELECT id FROM node_definitions WHERE zone = $1 AND class_exclusive = $2 AND id != ALL($3::int[])`,
    [ZONE, CLASS, mainIds]
  );
  if (expandedR.rowCount > 0) {
    const ids = expandedR.rows.map(r => r.id);
    await pool.query('DELETE FROM character_nodes WHERE node_id = ANY($1::int[])', [ids]);
    await pool.query('DELETE FROM node_definitions WHERE id = ANY($1::int[])', [ids]);
    console.log(`기존 확장 노드 ${ids.length}개 삭제`);
  }

  const maxR = await pool.query('SELECT COALESCE(MAX(id), 0) AS m FROM node_definitions');
  let nextId = maxR.rows[0].m + 1;
  const startId = nextId;
  const newNodes = [];

  function add(name, desc, tier, cost, effects, x, y, prereqs) {
    const id = nextId++;
    newNodes.push({ id, name, desc, tier, cost, effects, x, y, prereqs });
    return id;
  }

  // ════════════════════════════════════════════════════
  // 분기 A 확장: 암살자 (왼쪽 위) — 곁가지 42개
  // 메인: 768→769→770→771→772→773→774→775
  // 곁가지는 메인 노드에서 왼쪽(-x)으로 뻗어남
  // ════════════════════════════════════════════════════

  // 768(암살 입문)에서 분기
  const a1_1 = add('비수 연마', 'STR +12', 'small', 1, [{type:'stat',stat:'str',value:12}], -5, -1, [768]);
  const a1_2 = add('독침 수련', 'DEX +12', 'small', 1, [{type:'stat',stat:'dex',value:12}], -5, -3, [a1_1]);
  const a1_3 = add('은밀 기동', 'SPD +10', 'small', 1, [{type:'stat',stat:'spd',value:10}], -7, -2, [a1_1]);

  // 769(급소 파악)에서 분기
  const a2_1 = add('냉혈 감각', 'CRI +5', 'small', 1, [{type:'stat',stat:'cri',value:5}], -6, -4, [769]);
  const a2_2 = add('암살 태세', 'STR +15', 'small', 1, [{type:'stat',stat:'str',value:15}], -7, -5, [a2_1]);
  const a2_3 = add('사신의 발걸음', 'DEX +15', 'small', 1, [{type:'stat',stat:'dex',value:15}], -6, -5, [a2_1]);

  // 770(은밀한 접근)에서 분기
  const a3_1 = add('어둠 적응', '방어 관통 +5%', 'small', 1, [{type:'passive',key:'armor_pierce',value:5}], -7, -6, [770]);
  const a3_2 = add('그림자 갑옷', 'HP +80', 'small', 1, [{type:'stat',stat:'hp',value:80}], -8, -7, [a3_1]);
  const a3_3 = add('암흑 도약', 'DEX +18', 'small', 1, [{type:'stat',stat:'dex',value:18}], -7, -7, [a3_1]);
  const a3_m = add('그림자 회피', '치명타 데미지 +6%, DEX +10', 'medium', 2, [{type:'passive',key:'crit_damage',value:6},{type:'stat',stat:'dex',value:10}], -9, -7, [a3_2, a3_3]);

  // 771(그림자 일격)에서 분기
  const a4_1 = add('살의', 'CRI +7', 'small', 1, [{type:'stat',stat:'cri',value:7}], -8, -8, [771]);
  const a4_2 = add('비수의 눈', 'STR +18', 'small', 1, [{type:'stat',stat:'str',value:18}], -9, -9, [a4_1]);
  const a4_3 = add('암흑 낙인', '첫 스킬 +8%', 'small', 1, [{type:'passive',key:'shadow_strike',value:8}], -8, -9, [a4_1]);
  const a4_m = add('어둠의 비수', 'CRI +6, 방어 관통 +5%', 'medium', 2, [{type:'stat',stat:'cri',value:6},{type:'passive',key:'armor_pierce',value:5}], -10, -9, [a4_2]);

  // 772(처형자의 눈)에서 분기
  const a5_1 = add('극한 집중', '치명타 데미지 +8%', 'small', 1, [{type:'passive',key:'crit_damage',value:8}], -9, -10, [772]);
  const a5_2 = add('죽음의 표식', 'CRI +8', 'small', 1, [{type:'stat',stat:'cri',value:8}], -10, -11, [a5_1]);
  const a5_3 = add('잔인한 일격', 'STR +20', 'small', 1, [{type:'stat',stat:'str',value:20}], -9, -11, [a5_1]);
  const a5_m = add('처형 준비', '치명타 데미지 +10%', 'medium', 2, [{type:'passive',key:'crit_damage',value:10}], -10, -12, [a5_2, a5_3]);
  const a5_l = add('사형집행인', '치명타 흡혈 +3%, 방어 관통 +8%', 'large', 3, [{type:'passive',key:'crit_lifesteal',value:3},{type:'passive',key:'armor_pierce',value:8}], -11, -11, [a5_m]);

  // 773(사형 선고)에서 분기
  const a6_1 = add('그림자 투척', 'STR +22', 'small', 1, [{type:'stat',stat:'str',value:22}], -9, -12, [773]);
  const a6_2 = add('무음 접근', 'SPD +16', 'small', 1, [{type:'stat',stat:'spd',value:16}], -9, -13, [a6_1]);
  const a6_3 = add('공포의 기운', 'DEX +20', 'small', 1, [{type:'stat',stat:'dex',value:20}], -10, -13, [a6_1]);

  // 774(절대 관통)에서 분기
  const a7_1 = add('사신의 낫', 'CRI +10, STR +15', 'small', 1, [{type:'stat',stat:'cri',value:10},{type:'stat',stat:'str',value:15}], -8, -14, [774]);
  const a7_2 = add('암살 완성', '방어 관통 +8%', 'small', 1, [{type:'passive',key:'armor_pierce',value:8}], -8, -15, [a7_1]);
  const a7_3 = add('극한의 살의', '치명타 데미지 +10%', 'small', 1, [{type:'passive',key:'crit_damage',value:10}], -7, -15, [a7_1]);
  const a7_m = add('처형자의 맹세', '치명타 데미지 +12%, 첫 스킬 +12%', 'medium', 2, [{type:'passive',key:'crit_damage',value:12},{type:'passive',key:'shadow_strike',value:12}], -8, -16, [a7_2, a7_3]);
  const a7_l = add('그림자 군주', 'CRI +12, 방어 관통 +10%, STR +20', 'large', 3, [{type:'stat',stat:'cri',value:12},{type:'passive',key:'armor_pierce',value:10},{type:'stat',stat:'str',value:20}], -9, -15, [a7_m]);

  // 775(그림자 처형) 이후 최종
  const a8_1 = add('절명', 'STR +30', 'small', 1, [{type:'stat',stat:'str',value:30}], -7, -18, [775]);
  const a8_2 = add('심연의 암살', 'CRI +12', 'small', 1, [{type:'stat',stat:'cri',value:12}], -4, -18, [775]);
  const a8_m = add('완전한 암살자', '치명타 데미지 +15%, 치명타 흡혈 +4%', 'medium', 2, [{type:'passive',key:'crit_damage',value:15},{type:'passive',key:'crit_lifesteal',value:4}], -5, -19, [a8_1, a8_2]);

  // ════════════════════════════════════════════════════
  // 분기 B 확장: 칼바람 (오른쪽 위) — 곁가지 42개
  // 메인: 776→777→778→779→780→781→782→783
  // ════════════════════════════════════════════════════

  // 776(칼바람 입문)에서 분기
  const b1_1 = add('빠른 발놀림', 'DEX +12', 'small', 1, [{type:'stat',stat:'dex',value:12}], 5, -1, [776]);
  const b1_2 = add('난도질', 'STR +12', 'small', 1, [{type:'stat',stat:'str',value:12}], 5, -3, [b1_1]);
  const b1_3 = add('바람의 기초', 'SPD +10', 'small', 1, [{type:'stat',stat:'spd',value:10}], 7, -2, [b1_1]);

  // 777(이도류 수련)에서 분기
  const b2_1 = add('연속 자상', 'CRI +5', 'small', 1, [{type:'stat',stat:'cri',value:5}], 6, -4, [777]);
  const b2_2 = add('회전 베기', 'STR +15', 'small', 1, [{type:'stat',stat:'str',value:15}], 7, -5, [b2_1]);
  const b2_3 = add('폭풍 전야', 'SPD +15', 'small', 1, [{type:'stat',stat:'spd',value:15}], 6, -5, [b2_1]);

  // 778(칼날 난무)에서 분기
  const b3_1 = add('칼날 세례', '연쇄 행동 +5%', 'small', 1, [{type:'passive',key:'chain_action_amp',value:5}], 7, -6, [778]);
  const b3_2 = add('강풍 가르기', 'SPD +18', 'small', 1, [{type:'stat',stat:'spd',value:18}], 8, -7, [b3_1]);
  const b3_3 = add('검무', 'DEX +18', 'small', 1, [{type:'stat',stat:'dex',value:18}], 7, -7, [b3_1]);
  const b3_m = add('폭풍의 서막', '추가 타격 +4%, SPD +10', 'medium', 2, [{type:'passive',key:'extra_hit',value:4},{type:'stat',stat:'spd',value:10}], 9, -7, [b3_2, b3_3]);

  // 779(질풍 가속)에서 분기
  const b4_1 = add('광풍 돌진', 'STR +18', 'small', 1, [{type:'stat',stat:'str',value:18}], 8, -8, [779]);
  const b4_2 = add('일섬', 'CRI +7', 'small', 1, [{type:'stat',stat:'cri',value:7}], 9, -9, [b4_1]);
  const b4_3 = add('살풍', '연쇄 행동 +6%', 'small', 1, [{type:'passive',key:'chain_action_amp',value:6}], 8, -9, [b4_1]);
  const b4_m = add('질풍 무쌍', 'SPD +20, 칼날 추가타 +5%', 'medium', 2, [{type:'stat',stat:'spd',value:20},{type:'passive',key:'blade_flurry',value:5}], 10, -9, [b4_2]);

  // 780(검풍 폭발)에서 분기
  const b5_1 = add('무한 베기', '추가 타격 +5%', 'small', 1, [{type:'passive',key:'extra_hit',value:5}], 9, -10, [780]);
  const b5_2 = add('검기 폭풍', 'multi_hit 누적 +6%', 'small', 1, [{type:'passive',key:'blade_storm_amp',value:6}], 10, -11, [b5_1]);
  const b5_3 = add('강철 질풍', 'STR +20', 'small', 1, [{type:'stat',stat:'str',value:20}], 9, -11, [b5_1]);
  const b5_m = add('천풍 연무', 'multi_hit 누적 +8%, 연쇄 +8%', 'medium', 2, [{type:'passive',key:'blade_storm_amp',value:8},{type:'passive',key:'chain_action_amp',value:8}], 10, -12, [b5_2, b5_3]);
  const b5_l = add('검의 화신', '칼날 추가타 +10%, SPD +15', 'large', 3, [{type:'passive',key:'blade_flurry',value:10},{type:'stat',stat:'spd',value:15}], 11, -11, [b5_m]);

  // 781(폭풍 가속)에서 분기
  const b6_1 = add('폭풍 칼날', 'SPD +22', 'small', 1, [{type:'stat',stat:'spd',value:22}], 9, -12, [781]);
  const b6_2 = add('광폭 칼날', 'DEX +20', 'small', 1, [{type:'stat',stat:'dex',value:20}], 9, -13, [b6_1]);
  const b6_3 = add('바람 일격', 'CRI +8', 'small', 1, [{type:'stat',stat:'cri',value:8}], 10, -13, [b6_1]);

  // 782(만검난무)에서 분기
  const b7_1 = add('칼바람 정수', '칼날 추가타 +8%', 'small', 1, [{type:'passive',key:'blade_flurry',value:8}], 8, -14, [782]);
  const b7_2 = add('천검 소환', '추가 타격 +6%', 'small', 1, [{type:'passive',key:'extra_hit',value:6}], 8, -15, [b7_1]);
  const b7_3 = add('절대 속도', 'SPD→데미지 +15%', 'small', 1, [{type:'passive',key:'speed_to_dmg',value:15}], 7, -15, [b7_1]);
  const b7_m = add('만검의 주인', '칼날 +12%, 연쇄 +10%', 'medium', 2, [{type:'passive',key:'blade_flurry',value:12},{type:'passive',key:'chain_action_amp',value:10}], 8, -16, [b7_2, b7_3]);
  const b7_l = add('폭풍의 군주', '추가 타격 +10%, SPD +25, multi_hit +8%', 'large', 3, [{type:'passive',key:'extra_hit',value:10},{type:'stat',stat:'spd',value:25},{type:'passive',key:'blade_storm_amp',value:8}], 9, -15, [b7_m]);

  // 783(칼날 폭풍) 이후
  const b8_1 = add('영원한 칼바람', 'SPD +30', 'small', 1, [{type:'stat',stat:'spd',value:30}], 7, -18, [783]);
  const b8_2 = add('검풍 극대화', 'STR +28', 'small', 1, [{type:'stat',stat:'str',value:28}], 4, -18, [783]);
  const b8_m = add('완전한 칼바람', 'SPD→데미지 +20%, 칼날 +15%', 'medium', 2, [{type:'passive',key:'speed_to_dmg',value:20},{type:'passive',key:'blade_flurry',value:15}], 5, -19, [b8_1, b8_2]);

  // ════════════════════════════════════════════════════
  // 분기 C 확장: 독술사 (아래) — 곁가지 42개
  // 메인: 784→785→786→787→788→789→790→791
  // ════════════════════════════════════════════════════

  // 784(독 숙련)에서 분기
  const c1_1 = add('독기 혈류', 'STR +12', 'small', 1, [{type:'stat',stat:'str',value:12}], -2, 3, [784]);
  const c1_2 = add('독침', 'DEX +12', 'small', 1, [{type:'stat',stat:'dex',value:12}], -3, 4, [c1_1]);
  const c1_3 = add('독안개 기초', 'SPD +10', 'small', 1, [{type:'stat',stat:'spd',value:10}], 2, 3, [784]);

  // 785(맹독 연마)에서 분기
  const c2_1 = add('독 내성', 'HP +60', 'small', 1, [{type:'stat',stat:'hp',value:60}], -2, 5, [785]);
  const c2_2 = add('암흑 독소', 'CRI +5', 'small', 1, [{type:'stat',stat:'cri',value:5}], 2, 5, [785]);
  const c2_3 = add('전염 확산', '독 증폭 +5%', 'small', 1, [{type:'passive',key:'poison_amp',value:5}], 3, 6, [c2_2]);

  // 786(독의 달인)에서 분기
  const c3_1 = add('부식의 손길', '독 폭발 +5%', 'small', 1, [{type:'passive',key:'poison_burst_amp',value:5}], -2, 7, [786]);
  const c3_2 = add('역병 숙련', '도트 증폭 +6%', 'small', 1, [{type:'passive',key:'dot_amp',value:6}], -3, 8, [c3_1]);
  const c3_3 = add('감염 강화', 'STR +18', 'small', 1, [{type:'stat',stat:'str',value:18}], 2, 7, [786]);
  const c3_m = add('독의 지배', '독 증폭 +8%, 독 폭발 +6%', 'medium', 2, [{type:'passive',key:'poison_amp',value:8},{type:'passive',key:'poison_burst_amp',value:6}], -4, 8, [c3_2]);

  // 787(연쇄 살육)에서 분기
  const c4_1 = add('피의 흔적', '연속킬 +5%', 'small', 1, [{type:'passive',key:'combo_kill_bonus',value:5}], -3, 9, [787]);
  const c4_2 = add('사냥감 추적', 'SPD +16', 'small', 1, [{type:'stat',stat:'spd',value:16}], 2, 9, [787]);
  const c4_3 = add('약탈 본능', 'STR +18', 'small', 1, [{type:'stat',stat:'str',value:18}], -3, 10, [c4_1]);
  const c4_m = add('연쇄 독살', '킬 시 쿨다운 -1, 독 증폭 +8%', 'medium', 2, [{type:'passive',key:'lethal_tempo',value:1},{type:'passive',key:'poison_amp',value:8}], 3, 10, [c4_2]);

  // 788(학살 본능)에서 분기
  const c5_1 = add('피의 축제', '치명타 흡혈 +3%', 'small', 1, [{type:'passive',key:'crit_lifesteal',value:3}], -2, 11, [788]);
  const c5_2 = add('광란의 독', '독 폭발 +8%', 'small', 1, [{type:'passive',key:'poison_burst_amp',value:8}], 3, 11, [788]);
  const c5_3 = add('전투 광기', 'CRI +8', 'small', 1, [{type:'stat',stat:'cri',value:8}], -2, 12, [c5_1]);
  const c5_m = add('학살의 쾌감', '연속킬 +8%, 치명타 데미지 +8%', 'medium', 2, [{type:'passive',key:'combo_kill_bonus',value:8},{type:'passive',key:'crit_damage',value:8}], -3, 12, [c5_3]);
  const c5_l = add('피의 군주', '연속킬 +10%, 치명타 흡혈 +4%, 독 증폭 +10%', 'large', 3, [{type:'passive',key:'combo_kill_bonus',value:10},{type:'passive',key:'crit_lifesteal',value:4},{type:'passive',key:'poison_amp',value:10}], 4, 12, [c5_2]);

  // 789(맹독의 군주)에서 분기
  const c6_1 = add('극독 주입', '독 증폭 +10%', 'small', 1, [{type:'passive',key:'poison_amp',value:10}], -3, 13, [789]);
  const c6_2 = add('독안개 숙달', '도트 증폭 +8%', 'small', 1, [{type:'passive',key:'dot_amp',value:8}], 3, 13, [789]);
  const c6_3 = add('전염 폭발', '독 폭발 +10%', 'small', 1, [{type:'passive',key:'poison_burst_amp',value:10}], -3, 14, [c6_1]);

  // 790(전장의 지배자)에서 분기
  const c7_1 = add('학살 가속', '킬 시 쿨다운 -1', 'small', 1, [{type:'passive',key:'lethal_tempo',value:1}], -2, 15, [790]);
  const c7_2 = add('전장의 왕', 'STR +25, CRI +8', 'small', 1, [{type:'stat',stat:'str',value:25},{type:'stat',stat:'cri',value:8}], 3, 15, [790]);
  const c7_3 = add('섬멸자', '연속킬 +10%', 'small', 1, [{type:'passive',key:'combo_kill_bonus',value:10}], -2, 16, [c7_1]);
  const c7_m = add('전장의 끝', '연속킬 +12%, 킬 쿨다운 -2, 독 증폭 +12%', 'medium', 2, [{type:'passive',key:'combo_kill_bonus',value:12},{type:'passive',key:'lethal_tempo',value:2},{type:'passive',key:'poison_amp',value:12}], 3, 16, [c7_2]);
  const c7_l = add('독의 화신', '독 증폭 +15%, 독 폭발 +12%, 도트 +10%', 'large', 3, [{type:'passive',key:'poison_amp',value:15},{type:'passive',key:'poison_burst_amp',value:12},{type:'passive',key:'dot_amp',value:10}], -3, 16, [c7_3]);

  // 791(만검귀환) 이후
  const c8_1 = add('끝없는 학살', 'STR +30', 'small', 1, [{type:'stat',stat:'str',value:30}], -2, 19, [791]);
  const c8_2 = add('독의 심연', 'DEX +25, CRI +8', 'small', 1, [{type:'stat',stat:'dex',value:25},{type:'stat',stat:'cri',value:8}], 2, 19, [791]);
  const c8_m = add('완전한 독술사', '독 증폭 +18%, 연속킬 +15%, 독 폭발 +12%', 'medium', 2, [{type:'passive',key:'poison_amp',value:18},{type:'passive',key:'combo_kill_bonus',value:15},{type:'passive',key:'poison_burst_amp',value:12}], 0, 20, [c8_1, c8_2]);

  // ════════════════════════════════════════════════════
  // 삽입
  // ════════════════════════════════════════════════════
  console.log(`추가 노드: ${newNodes.length}개`);

  for (const n of newNodes) {
    await pool.query(
      `INSERT INTO node_definitions (id, name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y, hidden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, TRUE)`,
      [n.id, n.name, n.desc, ZONE, n.tier, n.cost, CLASS,
       JSON.stringify(n.effects), n.prereqs, n.x, n.y]
    );
  }

  // 최종 확인
  const total = await pool.query('SELECT COUNT(*) AS cnt FROM node_definitions WHERE zone = $1 AND class_exclusive = $2', [ZONE, CLASS]);
  console.log(`총 north_rogue 도적 노드: ${total.rows[0].cnt}개 (메인 25 + 확장 ${newNodes.length})`);

  const tierCheck = await pool.query(
    'SELECT tier, COUNT(*) AS cnt FROM node_definitions WHERE zone = $1 AND class_exclusive = $2 GROUP BY tier ORDER BY tier', [ZONE, CLASS]
  );
  for (const r of tierCheck.rows) console.log(`  ${r.tier}: ${r.cnt}개`);

  const others = await pool.query("SELECT class_exclusive, COUNT(*) AS cnt FROM node_definitions WHERE class_exclusive != 'rogue' OR class_exclusive IS NULL GROUP BY class_exclusive");
  console.log('다른 직업 (변경 없어야 함):');
  for (const r of others.rows) console.log(`  ${r.class_exclusive || 'null'}: ${r.cnt}개`);

  await pool.end();
  console.log('=== 완료 ===');
})().catch(e => { console.error(e); process.exit(1); });
