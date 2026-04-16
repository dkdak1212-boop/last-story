/**
 * 도적 노드 트리 v2 — 암살자 × 칼바람 하이브리드 (200개)
 * zone: north_rogue, class_exclusive: rogue, hidden: true (어드민 전용)
 *
 * 구조:
 *   중앙(기본) → 좌측(암살자 계열) / 우측(칼바람 계열)
 *   칼바람에 더 무게 (120 vs 80)
 *
 * 키스톤(huge) 5개:
 *   1. 그림자 처형 (암살) — 치명타 시 즉사 확률
 *   2. 무한 칼날 (칼바람) — 추가타 극대화
 *   3. 질풍노도 (칼바람) — 속도→데미지 변환
 *   4. 칼날 폭풍 (칼바람) — multi_hit 강화 극대화
 *   5. 만검귀환 (하이브리드) — 연속킬 보너스
 *
 * 새 패시브 키 (전투 엔진에 구현 필요):
 *   - assassin_execute: 치명타 시 적 HP N% 이하면 즉사 확률
 *   - blade_storm_amp: multi_hit 타격당 데미지 누적 증가%
 *   - speed_to_dmg: SPD 1당 ATK +N% 변환
 *   - combo_kill_bonus: 연속 킬 시 데미지 +N% (킬마다 누적, 최대 5중첩)
 *   - blade_flurry: 일반공격 추가타 확률%
 *   - lethal_tempo: 킬 시 다음 공격 쿨다운 N행동 감소
 *   - shadow_strike: 첫 스킬 데미지 +N% (전투 시작 시)
 */

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const ZONE = 'north_rogue';
const CLASS = 'rogue';

(async () => {
  console.log('=== 도적 암살자×칼바람 노드 트리 생성 시작 ===');

  // 1. hidden 컬럼 확인/추가
  const colCheck = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'node_definitions' AND column_name = 'hidden'
  `);
  if (colCheck.rowCount === 0) {
    await pool.query('ALTER TABLE node_definitions ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE');
    console.log('hidden 컬럼 추가됨');
  }

  // 2. 기존 north_rogue 도적 전용 노드 삭제 (치명적맹독 포함)
  const existing = await pool.query(
    `SELECT id FROM node_definitions WHERE zone = $1 AND class_exclusive = $2`,
    [ZONE, CLASS]
  );
  if (existing.rowCount > 0) {
    const ids = existing.rows.map(r => r.id);
    await pool.query('DELETE FROM character_nodes WHERE node_id = ANY($1::int[])', [ids]);
    await pool.query('DELETE FROM node_definitions WHERE id = ANY($1::int[])', [ids]);
    console.log(`기존 north_rogue 도적 노드 ${ids.length}개 삭제`);
  }

  // 기존 dot_to_crit 노드도 확인 삭제
  const dotCrit = await pool.query(
    `SELECT id FROM node_definitions WHERE class_exclusive = 'rogue' AND effects::text LIKE '%dot_to_crit%'`
  );
  if (dotCrit.rowCount > 0) {
    const ids = dotCrit.rows.map(r => r.id);
    await pool.query('DELETE FROM character_nodes WHERE node_id = ANY($1::int[])', [ids]);
    await pool.query('DELETE FROM node_definitions WHERE id = ANY($1::int[])', [ids]);
    console.log(`치명적맹독 노드 삭제: ${ids.join(', ')}`);
  }

  // 3. 다음 ID 확보
  const maxR = await pool.query('SELECT COALESCE(MAX(id), 0) AS m FROM node_definitions');
  let nextId = maxR.rows[0].m + 1;
  const startId = nextId;

  // 4. 노드 정의
  const allNodes = [];

  function addNode(name, desc, tier, cost, effects, x, y, prereqOffsets = []) {
    const id = nextId++;
    allNodes.push({
      id, name, description: desc, tier, cost, effects,
      position_x: x, position_y: y,
      prereqOffsets, // startId 기준 오프셋 (나중에 절대 ID로 변환)
    });
    return allNodes.length - 1; // 배열 인덱스 반환
  }

  // ====================================================================
  // 중앙 기본 노드 (20개) — 양 계열 공통 기반
  // ====================================================================

  // 중앙 시작점 (4개 루트)
  const r0 = addNode('날카로운 감각', 'DEX +5', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 5 }], 0, 0);
  const r1 = addNode('민첩한 발놀림', 'SPD +3', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 3 }], 2, 0);
  const r2 = addNode('그림자 숨결', 'CRI +2', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 2 }], -2, 0);
  const r3 = addNode('암살 본능', 'ATK +8', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 8 }], 0, -2);

  // 중앙 2층
  const c4 = addNode('회피 본능', 'DEX +8', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 8 }], 1, -1, [r0]);
  const c5 = addNode('재빠른 손', 'SPD +5', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 5 }], -1, -1, [r1]);
  const c6 = addNode('독기 혈류', 'STR +6, DEX +4', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 6 }, { type: 'stat', stat: 'dex', value: 4 }], 0, -3, [r3]);
  const c7 = addNode('비수의 눈', 'CRI +3', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 3 }], -1, -2, [r2]);

  // 중앙 3층
  const c8 = addNode('급소 파악', '치명타 데미지 +5%', 'small', 1,
    [{ type: 'passive', key: 'crit_damage', value: 5 }], 0, -4, [c6]);
  const c9 = addNode('신속 발검', 'SPD +8', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 8 }], 2, -2, [c4]);
  const c10 = addNode('은밀한 접근', '방어 관통 +3%', 'small', 1,
    [{ type: 'passive', key: 'armor_pierce', value: 3 }], -2, -3, [c7]);

  // 중앙 medium (3개) — 분기점
  const cm0 = addNode('암흑의 칼날', 'ATK +15, CRI +3', 'medium', 2,
    [{ type: 'stat', stat: 'str', value: 15 }, { type: 'stat', stat: 'cri', value: 3 }], -1, -5, [c8, c10]);
  const cm1 = addNode('질풍의 기세', 'SPD +12, DEX +8', 'medium', 2,
    [{ type: 'stat', stat: 'spd', value: 12 }, { type: 'stat', stat: 'dex', value: 8 }], 1, -5, [c8, c9]);
  const cm2 = addNode('이중 칼날', '추가 타격 확률 +3%', 'medium', 2,
    [{ type: 'passive', key: 'extra_hit', value: 3 }], 0, -6, [cm0, cm1]);

  // 중앙 나머지 small (6개)
  const c14 = addNode('잔인한 일격', 'STR +10', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 10 }], -3, -4, [c10]);
  const c15 = addNode('뒷걸음질', 'DEX +10', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 10 }], 3, -3, [c9]);
  const c16 = addNode('어둠 적응', 'CRI +4', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 4 }], -3, -5, [c14]);
  const c17 = addNode('강인한 의지', 'HP +50', 'small', 1,
    [{ type: 'stat', stat: 'hp', value: 50 }], 3, -5, [c15]);
  const c18 = addNode('살의', '치명타 데미지 +3%', 'small', 1,
    [{ type: 'passive', key: 'crit_damage', value: 3 }], -2, -6, [cm0]);
  const c19 = addNode('칼바람 전조', '연쇄 행동 강화 +3%', 'small', 1,
    [{ type: 'passive', key: 'chain_action_amp', value: 3 }], 2, -6, [cm1]);

  // ====================================================================
  // 좌측: 암살자 계열 (80개) — 치명타/즉사/첫타/그림자
  // ====================================================================

  // --- 암살 1층 (10개 small) ---
  const a0 = addNode('그림자 걸음', 'DEX +12', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 12 }], -5, -6, [c16]);
  const a1 = addNode('치명적 시선', 'CRI +4', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 4 }], -4, -7, [c18]);
  const a2 = addNode('정밀 타격', '치명타 데미지 +4%', 'small', 1,
    [{ type: 'passive', key: 'crit_damage', value: 4 }], -6, -7, [a0]);
  const a3 = addNode('약점 간파', '방어 관통 +4%', 'small', 1,
    [{ type: 'passive', key: 'armor_pierce', value: 4 }], -5, -8, [a1]);
  const a4 = addNode('암살 태세', 'STR +14', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 14 }], -7, -7, [a2]);
  const a5 = addNode('독침', '독 증폭 +5%', 'small', 1,
    [{ type: 'passive', key: 'poison_amp', value: 5 }], -4, -9, [a3]);
  const a6 = addNode('은밀 강타', 'CRI +5', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 5 }], -7, -9, [a4]);
  const a7 = addNode('그림자 도약', 'SPD +10', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 10 }], -6, -9, [a3, a4]);
  const a8 = addNode('어둠의 손길', 'DEX +14', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 14 }], -8, -8, [a4]);
  const a9 = addNode('차가운 칼날', 'STR +10, CRI +2', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 10 }, { type: 'stat', stat: 'cri', value: 2 }], -5, -10, [a5]);

  // --- 암살 2층 medium (4개) ---
  const am0 = addNode('그림자 일격', '첫 스킬 데미지 +15%', 'medium', 2,
    [{ type: 'passive', key: 'shadow_strike', value: 15 }], -6, -11, [a7, a6]);
  const am1 = addNode('급소 천공', '치명타 데미지 +10%', 'medium', 2,
    [{ type: 'passive', key: 'crit_damage', value: 10 }], -4, -11, [a9, a5]);
  const am2 = addNode('독의 달인', '독 증폭 +10%', 'medium', 2,
    [{ type: 'passive', key: 'poison_amp', value: 10 }], -8, -10, [a8, a6]);
  const am3 = addNode('어둠 지배', '방어 관통 +6%', 'medium', 2,
    [{ type: 'passive', key: 'armor_pierce', value: 6 }], -7, -12, [am0]);

  // --- 암살 3층 (14개 small) ---
  const a10 = addNode('냉혈 살수', 'CRI +6', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 6 }], -5, -12, [am1]);
  const a11 = addNode('급소 꿰뚫기', '치명타 데미지 +5%', 'small', 1,
    [{ type: 'passive', key: 'crit_damage', value: 5 }], -4, -13, [a10]);
  const a12 = addNode('어둠의 가호', 'DEX +16', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 16 }], -9, -11, [am2]);
  const a13 = addNode('그림자 갑옷', 'HP +80', 'small', 1,
    [{ type: 'stat', stat: 'hp', value: 80 }], -8, -12, [am3]);
  const a14 = addNode('비수 연마', 'STR +16', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 16 }], -6, -13, [am3]);
  const a15 = addNode('살기', 'CRI +5, SPD +5', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 5 }, { type: 'stat', stat: 'spd', value: 5 }], -7, -13, [am3]);
  const a16 = addNode('치명 각성', '치명타 데미지 +4%', 'small', 1,
    [{ type: 'passive', key: 'crit_damage', value: 4 }], -3, -14, [a11]);
  const a17 = addNode('암흑 낙인', '독 증폭 +6%', 'small', 1,
    [{ type: 'passive', key: 'poison_amp', value: 6 }], -9, -13, [a12]);
  const a18 = addNode('밤의 사냥꾼', 'STR +12, DEX +8', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 12 }, { type: 'stat', stat: 'dex', value: 8 }], -5, -14, [a14]);
  const a19 = addNode('무음 접근', 'SPD +12', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 12 }], -8, -14, [a13]);
  const a20 = addNode('혈관 절단', '출혈 증폭 +8%', 'small', 1,
    [{ type: 'passive', key: 'bleed_amp', value: 8 }], -10, -12, [a12]);
  const a21 = addNode('어둠의 인도', '방어 관통 +4%', 'small', 1,
    [{ type: 'passive', key: 'armor_pierce', value: 4 }], -6, -14, [a15]);
  const a22 = addNode('잔혹한 집념', 'CRI +7', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 7 }], -4, -15, [a16]);
  const a23 = addNode('사신의 발걸음', 'DEX +18', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 18 }], -10, -14, [a20]);

  // --- 암살 4층 medium (3개) ---
  const am4 = addNode('치명적 약점', '치명타 데미지 +12%', 'medium', 2,
    [{ type: 'passive', key: 'crit_damage', value: 12 }], -4, -16, [a22, a18]);
  const am5 = addNode('그림자 폭발', '첫 스킬 데미지 +20%', 'medium', 2,
    [{ type: 'passive', key: 'shadow_strike', value: 20 }], -7, -15, [a21, a19]);
  const am6 = addNode('독살자의 손길', '독 증폭 +12%, 독 폭발 +8%', 'medium', 2,
    [{ type: 'passive', key: 'poison_amp', value: 12 }, { type: 'passive', key: 'poison_burst_amp', value: 8 }], -10, -15, [a23, a17]);

  // --- 암살 5층 (12개 small) ---
  const a24 = addNode('처형자의 눈', 'CRI +8', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 8 }], -3, -17, [am4]);
  const a25 = addNode('일격필살', '치명타 데미지 +6%', 'small', 1,
    [{ type: 'passive', key: 'crit_damage', value: 6 }], -5, -17, [am4]);
  const a26 = addNode('암흑 가속', 'SPD +15', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 15 }], -6, -16, [am5]);
  const a27 = addNode('그림자 분신', '추가 타격 +4%', 'small', 1,
    [{ type: 'passive', key: 'extra_hit', value: 4 }], -8, -16, [am5]);
  const a28 = addNode('맹독 주입', '독 증폭 +8%', 'small', 1,
    [{ type: 'passive', key: 'poison_amp', value: 8 }], -11, -16, [am6]);
  const a29 = addNode('절명검', 'STR +20', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 20 }], -4, -18, [a24]);
  const a30 = addNode('공포의 기운', '치명타 데미지 +5%', 'small', 1,
    [{ type: 'passive', key: 'crit_damage', value: 5 }], -6, -18, [a25, a26]);
  const a31 = addNode('암흑 숙련', 'DEX +20', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 20 }], -9, -17, [a27]);
  const a32 = addNode('심연의 독', '독 폭발 +10%', 'small', 1,
    [{ type: 'passive', key: 'poison_burst_amp', value: 10 }], -11, -17, [a28]);
  const a33 = addNode('사신의 낫', 'STR +15, CRI +5', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 15 }, { type: 'stat', stat: 'cri', value: 5 }], -7, -18, [a30]);
  const a34 = addNode('그림자 관통', '방어 관통 +6%', 'small', 1,
    [{ type: 'passive', key: 'armor_pierce', value: 6 }], -9, -18, [a31]);
  const a35 = addNode('죽음의 표식', '치명타 흡혈 +3%', 'small', 1,
    [{ type: 'passive', key: 'crit_lifesteal', value: 3 }], -5, -19, [a29]);

  // --- 암살 6층 medium (3개) ---
  const am7 = addNode('처형자의 맹세', '치명타 데미지 +15%', 'medium', 2,
    [{ type: 'passive', key: 'crit_damage', value: 15 }], -5, -20, [a35, a30]);
  const am8 = addNode('그림자 군주', '첫 스킬 데미지 +25%', 'medium', 2,
    [{ type: 'passive', key: 'shadow_strike', value: 25 }], -8, -19, [a33, a34]);
  const am9 = addNode('맹독의 대가', '독 증폭 +15%', 'medium', 2,
    [{ type: 'passive', key: 'poison_amp', value: 15 }], -11, -18, [a32]);

  // --- 암살 7층 (8개 small → 키스톤 연결) ---
  const a36 = addNode('극한의 살의', 'CRI +10', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 10 }], -4, -21, [am7]);
  const a37 = addNode('사형선고', '치명타 데미지 +8%', 'small', 1,
    [{ type: 'passive', key: 'crit_damage', value: 8 }], -6, -21, [am7]);
  const a38 = addNode('그림자 지배', 'SPD +18', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 18 }], -7, -20, [am8]);
  const a39 = addNode('살인 병기', 'STR +22', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 22 }], -9, -20, [am8]);
  const a40 = addNode('절대 관통', '방어 관통 +8%', 'small', 1,
    [{ type: 'passive', key: 'armor_pierce', value: 8 }], -5, -22, [a36]);
  const a41 = addNode('암살 완성', 'CRI +8, STR +12', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 8 }, { type: 'stat', stat: 'str', value: 12 }], -7, -22, [a37, a38]);
  const a42 = addNode('독의 군주', '독 증폭 +10%', 'small', 1,
    [{ type: 'passive', key: 'poison_amp', value: 10 }], -10, -20, [am9]);
  const am10 = addNode('처형 준비', '치명타 데미지 +12%, 방어 관통 +5%', 'medium', 2,
    [{ type: 'passive', key: 'crit_damage', value: 12 }, { type: 'passive', key: 'armor_pierce', value: 5 }], -6, -23, [a40, a41]);

  // ★ 키스톤 1: 그림자 처형
  const huge0 = addNode('그림자 처형', '치명타 시 적 HP 15% 이하면 30% 확률로 즉사\n첫 스킬 데미지 +30%', 'huge', 5,
    [{ type: 'passive', key: 'assassin_execute', value: 30 }, { type: 'passive', key: 'shadow_strike', value: 30 }],
    -6, -25, [am10]);

  // ====================================================================
  // 우측: 칼바람 계열 (120개) — 속도/다중타/연속킬
  // ====================================================================

  // --- 칼바람 1층 (12개 small) ---
  const b0 = addNode('빠른 칼놀림', 'SPD +10', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 10 }], 4, -7, [c19]);
  const b1 = addNode('난도질', 'STR +12', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 12 }], 5, -6, [c17]);
  const b2 = addNode('칼바람 입문', '연쇄 행동 강화 +4%', 'small', 1,
    [{ type: 'passive', key: 'chain_action_amp', value: 4 }], 3, -8, [b0]);
  const b3 = addNode('질풍 베기', 'SPD +8, STR +6', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 8 }, { type: 'stat', stat: 'str', value: 6 }], 6, -7, [b1]);
  const b4 = addNode('이도류', '추가 타격 +3%', 'small', 1,
    [{ type: 'passive', key: 'extra_hit', value: 3 }], 5, -8, [b0, b1]);
  const b5 = addNode('폭풍의 서막', 'DEX +12', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 12 }], 7, -8, [b3]);
  const b6 = addNode('회전 베기', 'STR +14', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 14 }], 4, -9, [b2]);
  const b7 = addNode('강풍 가르기', 'SPD +12', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 12 }], 6, -9, [b4]);
  const b8 = addNode('연속 자상', 'CRI +4', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 4 }], 8, -9, [b5]);
  const b9 = addNode('바람의 발걸음', 'DEX +14', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 14 }], 3, -10, [b6]);
  const b10 = addNode('칼날 세례', '연쇄 행동 강화 +5%', 'small', 1,
    [{ type: 'passive', key: 'chain_action_amp', value: 5 }], 5, -10, [b7]);
  const b11 = addNode('폭풍 전야', 'SPD +14', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 14 }], 7, -10, [b7, b8]);

  // --- 칼바람 2층 medium (5개) ---
  const bm0 = addNode('칼날 회오리', '추가 타격 +5%', 'medium', 2,
    [{ type: 'passive', key: 'extra_hit', value: 5 }], 4, -11, [b9, b10]);
  const bm1 = addNode('질풍 숙련', 'SPD +15, 연쇄 행동 강화 +5%', 'medium', 2,
    [{ type: 'stat', stat: 'spd', value: 15 }, { type: 'passive', key: 'chain_action_amp', value: 5 }], 6, -11, [b10, b11]);
  const bm2 = addNode('칼바람 오의', '칼날 추가타 확률 +5%', 'medium', 2,
    [{ type: 'passive', key: 'blade_flurry', value: 5 }], 8, -11, [b11, b8]);
  const bm3 = addNode('광풍 돌진', 'STR +18, SPD +8', 'medium', 2,
    [{ type: 'stat', stat: 'str', value: 18 }, { type: 'stat', stat: 'spd', value: 8 }], 5, -12, [bm0]);
  const bm4 = addNode('바람의 칼날', '치명타 데미지 +8%', 'medium', 2,
    [{ type: 'passive', key: 'crit_damage', value: 8 }], 7, -12, [bm1]);

  // --- 칼바람 3층 (16개 small) ---
  const b12 = addNode('무한 베기', '추가 타격 +3%', 'small', 1,
    [{ type: 'passive', key: 'extra_hit', value: 3 }], 3, -12, [bm0]);
  const b13 = addNode('칼날 춤', 'SPD +16', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 16 }], 4, -13, [bm3]);
  const b14 = addNode('폭풍 가속', 'DEX +16', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 16 }], 6, -13, [bm3, bm4]);
  const b15 = addNode('광란의 칼', 'STR +18', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 18 }], 8, -13, [bm2]);
  const b16 = addNode('칼바람 흐름', '연쇄 행동 강화 +6%', 'small', 1,
    [{ type: 'passive', key: 'chain_action_amp', value: 6 }], 9, -12, [bm2]);
  const b17 = addNode('난무 개시', 'CRI +6', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 6 }], 3, -14, [b12, b13]);
  const b18 = addNode('칼날 세례 II', 'STR +14, SPD +10', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 14 }, { type: 'stat', stat: 'spd', value: 10 }], 5, -14, [b13, b14]);
  const b19 = addNode('폭풍의 눈', '칼날 추가타 +4%', 'small', 1,
    [{ type: 'passive', key: 'blade_flurry', value: 4 }], 7, -14, [b14, b15]);
  const b20 = addNode('일섬', '치명타 데미지 +5%', 'small', 1,
    [{ type: 'passive', key: 'crit_damage', value: 5 }], 9, -14, [b16]);
  const b21 = addNode('검무', 'SPD +18', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 18 }], 4, -15, [b17]);
  const b22 = addNode('살풍', 'STR +16', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 16 }], 6, -15, [b18]);
  const b23 = addNode('무쌍 칼날', '추가 타격 +4%', 'small', 1,
    [{ type: 'passive', key: 'extra_hit', value: 4 }], 8, -15, [b19]);
  const b24 = addNode('강철 질풍', 'DEX +18', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 18 }], 10, -13, [b16]);
  const b25 = addNode('광풍', 'SPD +14, STR +10', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 14 }, { type: 'stat', stat: 'str', value: 10 }], 5, -16, [b21, b22]);
  const b26 = addNode('격류', '연쇄 행동 강화 +7%', 'small', 1,
    [{ type: 'passive', key: 'chain_action_amp', value: 7 }], 7, -16, [b22, b23]);
  const b27 = addNode('바람 일격', 'CRI +7', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 7 }], 10, -15, [b24, b20]);

  // --- 칼바람 4층 medium (5개) ---
  const bm5 = addNode('천풍 연무', '칼날 추가타 +8%', 'medium', 2,
    [{ type: 'passive', key: 'blade_flurry', value: 8 }], 4, -17, [b25, b21]);
  const bm6 = addNode('검풍 폭발', 'multi_hit 타격당 누적 +8%', 'medium', 2,
    [{ type: 'passive', key: 'blade_storm_amp', value: 8 }], 6, -17, [b25, b26]);
  const bm7 = addNode('폭풍 가호', 'HP +100, DEX +15', 'medium', 2,
    [{ type: 'stat', stat: 'hp', value: 100 }, { type: 'stat', stat: 'dex', value: 15 }], 8, -17, [b26, b23]);
  const bm8 = addNode('칼날 광풍', '추가 타격 +6%, 연쇄 행동 +5%', 'medium', 2,
    [{ type: 'passive', key: 'extra_hit', value: 6 }, { type: 'passive', key: 'chain_action_amp', value: 5 }], 10, -16, [b27]);
  const bm9 = addNode('질풍 절단', '치명타 데미지 +10%', 'medium', 2,
    [{ type: 'passive', key: 'crit_damage', value: 10 }], 9, -17, [bm7, b27]);

  // --- 칼바람 5층 (16개 small) ---
  const b28 = addNode('무한 질풍', 'SPD +20', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 20 }], 3, -18, [bm5]);
  const b29 = addNode('칼바람 질주', '칼날 추가타 +5%', 'small', 1,
    [{ type: 'passive', key: 'blade_flurry', value: 5 }], 5, -18, [bm5, bm6]);
  const b30 = addNode('검풍 연쇄', 'multi_hit 누적 +5%', 'small', 1,
    [{ type: 'passive', key: 'blade_storm_amp', value: 5 }], 7, -18, [bm6, bm7]);
  const b31 = addNode('강풍 투사', 'STR +22', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 22 }], 9, -18, [bm9]);
  const b32 = addNode('칼날 가속', 'SPD +22', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 22 }], 11, -17, [bm8]);
  const b33 = addNode('연속 베기', '추가 타격 +4%', 'small', 1,
    [{ type: 'passive', key: 'extra_hit', value: 4 }], 3, -19, [b28]);
  const b34 = addNode('바람의 이치', 'DEX +20', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 20 }], 5, -19, [b29]);
  const b35 = addNode('검기 폭풍', '연쇄 행동 강화 +8%', 'small', 1,
    [{ type: 'passive', key: 'chain_action_amp', value: 8 }], 7, -19, [b30]);
  const b36 = addNode('만검 소환', 'CRI +8', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 8 }], 9, -19, [b31]);
  const b37 = addNode('무쌍의 경지', '추가 타격 +5%', 'small', 1,
    [{ type: 'passive', key: 'extra_hit', value: 5 }], 11, -18, [b32]);
  const b38 = addNode('폭풍 칼날', 'STR +18, SPD +12', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 18 }, { type: 'stat', stat: 'spd', value: 12 }], 4, -20, [b33, b34]);
  const b39 = addNode('검의 화신', '칼날 추가타 +6%', 'small', 1,
    [{ type: 'passive', key: 'blade_flurry', value: 6 }], 6, -20, [b34, b35]);
  const b40 = addNode('칼바람 숙달', 'multi_hit 누적 +6%', 'small', 1,
    [{ type: 'passive', key: 'blade_storm_amp', value: 6 }], 8, -20, [b35, b36]);
  const b41 = addNode('질풍 무쌍', 'SPD +25', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 25 }], 10, -19, [b37]);
  const b42 = addNode('광폭 칼날', 'STR +24', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 24 }], 10, -20, [b41, b36]);
  const b43 = addNode('바람 갈무리', 'CRI +6, DEX +12', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 6 }, { type: 'stat', stat: 'dex', value: 12 }], 12, -18, [b37]);

  // --- 칼바람 6층 medium (5개) ---
  const bm10 = addNode('만검난무', '칼날 추가타 +10%, 추가 타격 +5%', 'medium', 2,
    [{ type: 'passive', key: 'blade_flurry', value: 10 }, { type: 'passive', key: 'extra_hit', value: 5 }], 5, -21, [b38, b39]);
  const bm11 = addNode('검풍 대폭발', 'multi_hit 누적 +10%', 'medium', 2,
    [{ type: 'passive', key: 'blade_storm_amp', value: 10 }], 7, -21, [b39, b40]);
  const bm12 = addNode('속도의 대가', 'SPD→데미지 변환 30%', 'medium', 2,
    [{ type: 'passive', key: 'speed_to_dmg', value: 30 }], 9, -21, [b40, b42]);
  const bm13 = addNode('킬 가속', '킬 시 쿨다운 -1행동', 'medium', 2,
    [{ type: 'passive', key: 'lethal_tempo', value: 1 }], 11, -20, [b42, b43]);
  const bm14 = addNode('치명 질풍', '치명타 데미지 +12%', 'medium', 2,
    [{ type: 'passive', key: 'crit_damage', value: 12 }], 4, -22, [b38, b33]);

  // --- 칼바람 7층 (12개 small → 키스톤 연결) ---
  const b44 = addNode('영원한 칼바람', '연쇄 행동 강화 +10%', 'small', 1,
    [{ type: 'passive', key: 'chain_action_amp', value: 10 }], 5, -23, [bm10, bm14]);
  const b45 = addNode('검풍 극대화', 'multi_hit 누적 +7%', 'small', 1,
    [{ type: 'passive', key: 'blade_storm_amp', value: 7 }], 7, -23, [bm11]);
  const b46 = addNode('폭풍의 화신', 'SPD +28', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 28 }], 9, -23, [bm12]);
  const b47 = addNode('킬 쇄도', '킬 시 쿨다운 -1행동', 'small', 1,
    [{ type: 'passive', key: 'lethal_tempo', value: 1 }], 11, -22, [bm13]);
  const b48 = addNode('강풍 군주', 'STR +28', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 28 }], 6, -24, [b44]);
  const b49 = addNode('만검의 주인', '칼날 추가타 +8%', 'small', 1,
    [{ type: 'passive', key: 'blade_flurry', value: 8 }], 4, -24, [b44]);
  const b50 = addNode('검풍 완성', '추가 타격 +6%', 'small', 1,
    [{ type: 'passive', key: 'extra_hit', value: 6 }], 8, -24, [b45, b46]);
  const b51 = addNode('폭풍 절정', 'DEX +24, CRI +6', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 24 }, { type: 'stat', stat: 'cri', value: 6 }], 10, -24, [b46, b47]);
  const b52 = addNode('속도의 극한', 'SPD +30', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 30 }], 12, -22, [b47]);
  const b53 = addNode('칼바람 정수', '치명타 데미지 +8%', 'small', 1,
    [{ type: 'passive', key: 'crit_damage', value: 8 }], 5, -25, [b48, b49]);
  const b54 = addNode('천검 소환', '추가 타격 +7%', 'small', 1,
    [{ type: 'passive', key: 'extra_hit', value: 7 }], 7, -25, [b50]);
  const b55 = addNode('절대 속도', 'SPD→데미지 변환 20%', 'small', 1,
    [{ type: 'passive', key: 'speed_to_dmg', value: 20 }], 9, -25, [b50, b51]);

  // --- 칼바람 키스톤 연결 medium (3개) ---
  const bm15 = addNode('무한 칼날 준비', '칼날 추가타 +12%, 추가 타격 +8%', 'medium', 2,
    [{ type: 'passive', key: 'blade_flurry', value: 12 }, { type: 'passive', key: 'extra_hit', value: 8 }], 5, -26, [b53]);
  const bm16 = addNode('질풍노도 준비', 'SPD→데미지 변환 25%, SPD +20', 'medium', 2,
    [{ type: 'passive', key: 'speed_to_dmg', value: 25 }, { type: 'stat', stat: 'spd', value: 20 }], 9, -26, [b55]);
  const bm17 = addNode('칼날 폭풍 준비', 'multi_hit 누적 +12%, 연쇄 행동 +10%', 'medium', 2,
    [{ type: 'passive', key: 'blade_storm_amp', value: 12 }, { type: 'passive', key: 'chain_action_amp', value: 10 }], 7, -26, [b54]);

  // ★ 키스톤 2: 무한 칼날
  const huge1 = addNode('무한 칼날', '칼날 추가타 +20%\n추가 타격 +10%\n킬 시 쿨다운 -2행동', 'huge', 5,
    [{ type: 'passive', key: 'blade_flurry', value: 20 }, { type: 'passive', key: 'extra_hit', value: 10 }, { type: 'passive', key: 'lethal_tempo', value: 2 }],
    5, -28, [bm15]);

  // ★ 키스톤 3: 질풍노도
  const huge2 = addNode('질풍노도', 'SPD 1당 ATK +0.5% 변환\nSPD→데미지 변환 +30%\n속도 +30', 'huge', 5,
    [{ type: 'passive', key: 'speed_to_dmg', value: 30 }, { type: 'stat', stat: 'spd', value: 30 }],
    9, -28, [bm16]);

  // ★ 키스톤 4: 칼날 폭풍
  const huge3 = addNode('칼날 폭풍', 'multi_hit 타격당 누적 +15%\n연쇄 행동 강화 +15%\n추가 타격 +8%', 'huge', 5,
    [{ type: 'passive', key: 'blade_storm_amp', value: 15 }, { type: 'passive', key: 'chain_action_amp', value: 15 }, { type: 'passive', key: 'extra_hit', value: 8 }],
    7, -28, [bm17]);

  // ====================================================================
  // 하단: 하이브리드 계열 (연속킬 보너스) → 키스톤 5
  // ====================================================================

  // --- 하이브리드 연결부 (10개 small + 2 medium) ---
  const h0 = addNode('사냥 감각', 'STR +15, SPD +10', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 15 }, { type: 'stat', stat: 'spd', value: 10 }], 0, -8, [cm2]);
  const h1 = addNode('연속 사냥', '킬 시 쿨다운 -1행동', 'small', 1,
    [{ type: 'passive', key: 'lethal_tempo', value: 1 }], 1, -9, [h0]);
  const h2 = addNode('연쇄 살육', '연속킬 보너스 +5%', 'small', 1,
    [{ type: 'passive', key: 'combo_kill_bonus', value: 5 }], -1, -9, [h0]);
  const h3 = addNode('피의 갈증', '치명타 흡혈 +2%', 'small', 1,
    [{ type: 'passive', key: 'crit_lifesteal', value: 2 }], 0, -10, [h1, h2]);
  const h4 = addNode('학살 본능', '연속킬 보너스 +6%', 'small', 1,
    [{ type: 'passive', key: 'combo_kill_bonus', value: 6 }], -1, -11, [h3]);
  const h5 = addNode('킬 가속 II', '킬 시 쿨다운 -1행동', 'small', 1,
    [{ type: 'passive', key: 'lethal_tempo', value: 1 }], 1, -11, [h3]);
  const h6 = addNode('전장의 지배자', 'STR +20, CRI +5', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 20 }, { type: 'stat', stat: 'cri', value: 5 }], 0, -12, [h4, h5]);
  const hm0 = addNode('학살자', '연속킬 보너스 +10%', 'medium', 2,
    [{ type: 'passive', key: 'combo_kill_bonus', value: 10 }], -1, -13, [h6]);
  const hm1 = addNode('전장 가속', '킬 시 쿨다운 -1행동, SPD +15', 'medium', 2,
    [{ type: 'passive', key: 'lethal_tempo', value: 1 }, { type: 'stat', stat: 'spd', value: 15 }], 1, -13, [h6]);
  const h7 = addNode('대량 학살', '연속킬 보너스 +8%', 'small', 1,
    [{ type: 'passive', key: 'combo_kill_bonus', value: 8 }], 0, -14, [hm0, hm1]);

  // ★ 키스톤 5: 만검귀환
  const huge4 = addNode('만검귀환', '연속킬 시 데미지 +12% (최대 5중첩)\n킬 시 모든 스킬 쿨다운 -2행동\n치명타 데미지 +20%', 'huge', 5,
    [{ type: 'passive', key: 'combo_kill_bonus', value: 12 }, { type: 'passive', key: 'lethal_tempo', value: 2 }, { type: 'passive', key: 'crit_damage', value: 20 }],
    0, -16, [h7]);

  // ====================================================================
  // 추가 노드 (200개 달성용) — 각 계열 보강
  // ====================================================================

  // --- 암살 보강 (12개) ---
  const ax0 = addNode('그림자 회피', 'DEX +22', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 22 }], -10, -16, [am9]);
  const ax1 = addNode('독 폭발 연쇄', '독 폭발 +6%', 'small', 1,
    [{ type: 'passive', key: 'poison_burst_amp', value: 6 }], -11, -17, [ax0]);
  const ax2 = addNode('그림자 흡혈', '치명타 흡혈 +2%', 'small', 1,
    [{ type: 'passive', key: 'crit_lifesteal', value: 2 }], -12, -17, [ax1]);
  const ax3 = addNode('사신의 징표', 'CRI +9', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 9 }], -8, -21, [am8]);
  const ax4 = addNode('무음 학살', 'STR +25', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 25 }], -9, -21, [a39]);
  const ax5 = addNode('그림자 투척', '방어 관통 +5%', 'small', 1,
    [{ type: 'passive', key: 'armor_pierce', value: 5 }], -10, -21, [ax4]);
  const ax6 = addNode('독안개 숙련', '독 증폭 +7%', 'small', 1,
    [{ type: 'passive', key: 'poison_amp', value: 7 }], -11, -19, [ax1]);
  const ax7 = addNode('어둠의 비수', 'STR +18, CRI +4', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 18 }, { type: 'stat', stat: 'cri', value: 4 }], -8, -22, [ax3]);
  const ax8 = addNode('그림자 결계', 'HP +100', 'small', 1,
    [{ type: 'stat', stat: 'hp', value: 100 }], -12, -19, [ax2]);
  const ax9 = addNode('극독', '독 증폭 +9%', 'small', 1,
    [{ type: 'passive', key: 'poison_amp', value: 9 }], -12, -20, [ax8]);
  const axm0 = addNode('암흑의 완성', '치명타 데미지 +10%, 방어 관통 +5%', 'medium', 2,
    [{ type: 'passive', key: 'crit_damage', value: 10 }, { type: 'passive', key: 'armor_pierce', value: 5 }], -9, -23, [ax5, ax7]);
  const axm1 = addNode('맹독의 심연', '독 증폭 +12%, 독 폭발 +8%', 'medium', 2,
    [{ type: 'passive', key: 'poison_amp', value: 12 }, { type: 'passive', key: 'poison_burst_amp', value: 8 }], -12, -21, [ax9, ax6]);

  // --- 칼바람 보강 (14개) ---
  const bx0 = addNode('폭풍 절단', 'SPD +22, STR +10', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 22 }, { type: 'stat', stat: 'str', value: 10 }], 12, -20, [b43]);
  const bx1 = addNode('무한 회전', '추가 타격 +4%', 'small', 1,
    [{ type: 'passive', key: 'extra_hit', value: 4 }], 13, -19, [bx0]);
  const bx2 = addNode('바람 절단', '연쇄 행동 강화 +6%', 'small', 1,
    [{ type: 'passive', key: 'chain_action_amp', value: 6 }], 13, -20, [bx0]);
  const bx3 = addNode('광풍 연무', 'DEX +22', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 22 }], 12, -21, [bx0, b42]);
  const bx4 = addNode('검풍 사리', '치명타 데미지 +6%', 'small', 1,
    [{ type: 'passive', key: 'crit_damage', value: 6 }], 14, -20, [bx1, bx2]);
  const bx5 = addNode('난무 극의', 'STR +26', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 26 }], 11, -21, [b42]);
  const bx6 = addNode('강철 폭풍', 'SPD +26', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 26 }], 13, -21, [bx3]);
  const bx7 = addNode('칼바람 연격', '칼날 추가타 +5%', 'small', 1,
    [{ type: 'passive', key: 'blade_flurry', value: 5 }], 11, -22, [bx5]);
  const bx8 = addNode('천검 일섬', 'CRI +8, SPD +10', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 8 }, { type: 'stat', stat: 'spd', value: 10 }], 14, -21, [bx4, bx6]);
  const bx9 = addNode('질풍 가속', '킬 시 쿨다운 -1행동', 'small', 1,
    [{ type: 'passive', key: 'lethal_tempo', value: 1 }], 12, -22, [bx6, bx7]);
  const bxm0 = addNode('천검 화신', '칼날 추가타 +10%, 연쇄 행동 +8%', 'medium', 2,
    [{ type: 'passive', key: 'blade_flurry', value: 10 }, { type: 'passive', key: 'chain_action_amp', value: 8 }], 12, -23, [bx7, bx9]);
  const bxm1 = addNode('절풍 극의', 'multi_hit 누적 +8%, SPD +15', 'medium', 2,
    [{ type: 'passive', key: 'blade_storm_amp', value: 8 }, { type: 'stat', stat: 'spd', value: 15 }], 14, -22, [bx8]);
  const bx10 = addNode('검기 폭류', 'STR +28', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 28 }], 13, -23, [bxm0, bxm1]);
  const bx11 = addNode('강풍 완결', 'DEX +26, CRI +5', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 26 }, { type: 'stat', stat: 'cri', value: 5 }], 11, -24, [bxm0]);

  // --- 하이브리드 보강 (10개) ---
  const hx0 = addNode('연쇄 처형', '연속킬 보너스 +4%', 'small', 1,
    [{ type: 'passive', key: 'combo_kill_bonus', value: 4 }], -2, -10, [h2]);
  const hx1 = addNode('빠른 사냥', 'SPD +14', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 14 }], 2, -10, [h1]);
  const hx2 = addNode('피의 축제', '치명타 흡혈 +2%', 'small', 1,
    [{ type: 'passive', key: 'crit_lifesteal', value: 2 }], -2, -12, [h4, hx0]);
  const hx3 = addNode('학살 가속', 'STR +18', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 18 }], 2, -12, [h5, hx1]);
  const hx4 = addNode('전장의 질풍', 'SPD +20', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 20 }], 2, -14, [hx3, hm1]);
  const hx5 = addNode('피의 광란', '연속킬 보너스 +5%', 'small', 1,
    [{ type: 'passive', key: 'combo_kill_bonus', value: 5 }], -2, -14, [hx2, hm0]);
  const hx6 = addNode('섬멸자', 'CRI +8, STR +12', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 8 }, { type: 'stat', stat: 'str', value: 12 }], 1, -15, [h7, hx4]);
  const hx7 = addNode('학살의 끝', 'DEX +20', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 20 }], -1, -15, [h7, hx5]);
  const hxm0 = addNode('전장의 왕', '연속킬 보너스 +8%, 킬 시 쿨다운 -1', 'medium', 2,
    [{ type: 'passive', key: 'combo_kill_bonus', value: 8 }, { type: 'passive', key: 'lethal_tempo', value: 1 }], 0, -15, [hx6, hx7]);
  const hx8 = addNode('끝없는 학살', '치명타 데미지 +6%, 추가 타격 +3%', 'small', 1,
    [{ type: 'passive', key: 'crit_damage', value: 6 }, { type: 'passive', key: 'extra_hit', value: 3 }], 0, -17, [hxm0]);
  const hx9 = addNode('전장의 마무리', 'STR +20, DEX +15', 'small', 1,
    [{ type: 'stat', stat: 'str', value: 20 }, { type: 'stat', stat: 'dex', value: 15 }], 1, -17, [hx8]);

  // ====================================================================
  // 5. 선행 노드 ID 변환 및 삽입
  // ====================================================================

  console.log(`총 노드 수: ${allNodes.length}`);

  // prereqOffsets → 절대 ID 변환
  for (const node of allNodes) {
    node.prerequisites = (node.prereqOffsets || []).map(idx => allNodes[idx].id);
    delete node.prereqOffsets;
  }

  // DB 삽입
  let inserted = 0;
  for (const n of allNodes) {
    await pool.query(
      `INSERT INTO node_definitions
       (id, name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y, hidden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, TRUE)`,
      [n.id, n.name, n.description, ZONE, n.tier, n.cost,
       CLASS, JSON.stringify(n.effects), n.prerequisites, n.position_x, n.position_y]
    );
    inserted++;
  }

  console.log(`${inserted}개 노드 삽입 완료 (ID ${startId} ~ ${nextId - 1})`);

  // 확인
  const countR = await pool.query(
    'SELECT tier, COUNT(*) AS cnt FROM node_definitions WHERE zone = $1 AND class_exclusive = $2 GROUP BY tier ORDER BY tier',
    [ZONE, CLASS]
  );
  console.log('티어별 분포:');
  for (const r of countR.rows) console.log(`  ${r.tier}: ${r.cnt}개`);

  const totalR = await pool.query(
    'SELECT COUNT(*) AS cnt FROM node_definitions WHERE zone = $1 AND class_exclusive = $2',
    [ZONE, CLASS]
  );
  console.log(`총 노드: ${totalR.rows[0].cnt}개`);

  const hiddenR = await pool.query(
    'SELECT COUNT(*) AS cnt FROM node_definitions WHERE zone = $1 AND class_exclusive = $2 AND hidden = TRUE',
    [ZONE, CLASS]
  );
  console.log(`hidden 노드: ${hiddenR.rows[0].cnt}개`);

  await pool.end();
  console.log('=== 완료 ===');
})().catch(e => { console.error(e); process.exit(1); });
