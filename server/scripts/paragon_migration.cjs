// 차원의 정수 (Paragon) 노드 트리 마이그레이션
// - characters.paragon_points 컬럼 추가
// - paragon zone 노드 91개 (1 hub + 18 keystone + 72 small)
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

// 18 키스톤 정의 — 각 스포크 끝에 위치
const KEYSTONES = [
  { key: 'paragon_iron_reflexes',     name: '철의 반사',       desc: '회피 0, 회피 1당 방어력 +1로 변환',                                                small: ['dodge_pct','dodge_pct','def_pct','def_pct'] },
  { key: 'paragon_fate_lock',         name: '운명의 결박',     desc: '회피·치명 0%, 모든 데미지 ±0% 고정 (확정 평균)',                                  small: ['accuracy_pct','accuracy_pct','accuracy_pct','accuracy_pct'] },
  { key: 'paragon_pain_attunement',   name: '고통의 조율',     desc: 'HP 35% 이하 시 모든 데미지 +50%',                                                  small: ['hp_pct','hp_pct','hp_pct','hp_pct'] },
  { key: 'paragon_dot_burst',         name: '연쇄 진동',       desc: '도트 데미지 50%를 매 행동 즉시 직접 데미지로 변환',                                small: ['matk_pct','matk_pct','crit_dmg_pct','crit_dmg_pct'] },
  { key: 'paragon_heavy_blade',       name: '무거운 검',       desc: '속도 −50%, 모든 데미지 ×2.5',                                                      small: ['atk_pct','atk_pct','atk_pct','atk_pct'] },
  { key: 'paragon_time_master',       name: '시간의 주인',     desc: '모든 쿨다운 −70%, 게이지 충전 −40%',                                               small: ['spd_pct','spd_pct','spd_pct','spd_pct'] },
  { key: 'paragon_balance_inversion', name: '반대의 균형',     desc: 'STR↔INT, DEX↔VIT 교체 + 교체 후 스탯 ×1.5',                                        small: ['atk_pct','matk_pct','hp_pct','spd_pct'] },
  { key: 'paragon_assassin_paradox',  name: '암살자의 역설',   desc: '적 HP 100% 시 ×3, HP 50% 이하 시 ×0.3 (역방향 처형)',                              small: ['crit_dmg_pct','crit_dmg_pct','crit_dmg_pct','crit_dmg_pct'] },
  { key: 'paragon_dormant_burst',     name: '잠재된 폭발',     desc: '5초 미피격 시 다음 공격 ×3 (피격 시 카운터 리셋)',                                 small: ['dodge_pct','dodge_pct','dodge_pct','dodge_pct'] },
  { key: 'paragon_dim_chain',         name: '차원의 결박',     desc: '적 첫 행동 시 자동 동결 1턴, 받는 데미지 +30%',                                    small: ['matk_pct','matk_pct','matk_pct','matk_pct'] },
  { key: 'paragon_shield_wrath',      name: '방패의 분노',     desc: '방어력 0, 잃은 방어 1당 공격력 +0.5',                                              small: ['def_pct','def_pct','def_pct','def_pct'] },
  { key: 'paragon_madness_slide',     name: '광기의 슬라이드', desc: 'HP 100% 시 데미지 −50%, HP 0%로 갈수록 +200% (선형 보간)',                        small: ['hp_pct','hp_pct','hp_pct','hp_pct'] },
  { key: 'paragon_time_crystal',      name: '시간의 결정',     desc: '매 10번째 행동 시 데미지 ×3 + 즉시 추가 행동 1회',                                  small: ['spd_pct','spd_pct','spd_pct','spd_pct'] },
  { key: 'paragon_pain_lord',         name: '고통의 군주',     desc: '자신 도트 데미지 ×2, but 매 턴 자신 max_hp 15% 자가 도트',                         small: ['matk_pct','matk_pct','crit_dmg_pct','crit_dmg_pct'] },
  { key: 'paragon_quick_decision',    name: '빠른 결단',       desc: '게이지 50% 시점 행동 가능, 모든 데미지 −30%',                                       small: ['spd_pct','spd_pct','spd_pct','spd_pct'] },
  { key: 'paragon_chance_lord',       name: '확률의 군주',     desc: '모든 확률 효과(치명·회피·dodge) ×2 (각 cap 100%)',                                  small: ['cri_pct','cri_pct','cri_pct','cri_pct'] },
  { key: 'paragon_failure_glory',     name: '실패의 영광',     desc: '빗맞 확률 +30%, 빗맞 직후 다음 공격 ×3',                                            small: ['dodge_pct','dodge_pct','accuracy_pct_neg','accuracy_pct_neg'] },
  { key: 'paragon_ice_tongue',        name: '얼음의 혀',       desc: '도트 부여 시 적에게 동결 1턴 자동, 동결 적 데미지 +30%',                            small: ['matk_pct','matk_pct','crit_dmg_pct','crit_dmg_pct'] },
];

// 작은 노드 효과 키 → 노드 정의 매핑 (passive_key 가 모두 paragon_*_pct 형태로 통일)
const SMALL_NODE_DEF = {
  hp_pct:           { name: '활력',       desc: '최대 HP +1%',          effect: { type: 'passive', key: 'paragon_hp_pct', value: 1 } },
  def_pct:          { name: '견고',       desc: '방어력 +1%',           effect: { type: 'passive', key: 'paragon_def_pct', value: 1 } },
  mdef_pct:         { name: '마법 저항',  desc: '마법방어 +1%',         effect: { type: 'passive', key: 'paragon_mdef_pct', value: 1 } },
  atk_pct:          { name: '단련',       desc: '공격력 +1%',           effect: { type: 'passive', key: 'paragon_atk_pct', value: 1 } },
  matk_pct:         { name: '마력',       desc: '마법공격 +1%',         effect: { type: 'passive', key: 'paragon_matk_pct', value: 1 } },
  spd_pct:          { name: '신속',       desc: '스피드 +1%',           effect: { type: 'passive', key: 'paragon_spd_pct', value: 1 } },
  accuracy_pct:     { name: '정확',       desc: '명중 +1%',             effect: { type: 'passive', key: 'paragon_accuracy_pct', value: 1 } },
  accuracy_pct_neg: { name: '둔감',       desc: '명중 −1% (빗맞 빌드)', effect: { type: 'passive', key: 'paragon_accuracy_pct', value: -1 } },
  dodge_pct:        { name: '회피',       desc: '회피 +1%',             effect: { type: 'passive', key: 'paragon_dodge_pct', value: 1 } },
  cri_pct:          { name: '집중',       desc: '치명타 확률 +0.5%',    effect: { type: 'passive', key: 'paragon_cri_pct', value: 1 } }, // 0.5% — 코드에서 value/2 처리
  crit_dmg_pct:     { name: '잔혹',       desc: '치명타 데미지 +1%',    effect: { type: 'passive', key: 'paragon_crit_dmg_pct', value: 1 } },
};

(async () => {
  console.log('=== Paragon migration start ===');

  // 1. paragon_points 컬럼 추가
  await pool.query(`
    ALTER TABLE characters
      ADD COLUMN IF NOT EXISTS paragon_points INTEGER NOT NULL DEFAULT 0
  `);
  console.log('[OK] characters.paragon_points 컬럼 보장');

  // 2. 기존 paragon zone 노드 정리 (재실행 안전성 — 멱등)
  const existR = await pool.query(`SELECT id FROM node_definitions WHERE zone = 'paragon'`);
  if (existR.rowCount > 0) {
    const ids = existR.rows.map(r => r.id);
    await pool.query(`DELETE FROM character_nodes WHERE node_id = ANY($1::int[])`, [ids]);
    await pool.query(`DELETE FROM node_definitions WHERE zone = 'paragon'`);
    console.log(`[OK] 기존 paragon 노드 ${ids.length}개 정리`);
  }

  // 3a. node_definitions sequence 동기화 — 과거 수동 INSERT 등으로 sequence 가 뒤처졌을 때 충돌 방지
  await pool.query(`SELECT setval(pg_get_serial_sequence('node_definitions', 'id'), COALESCE((SELECT MAX(id) FROM node_definitions), 0) + 1, false)`);
  console.log('[OK] node_definitions sequence 동기화');

  // 3. HUB 노드 생성 (cost 0 — 진입 게이트, Lv.100 도달 시 무료 활성)
  const hubR = await pool.query(`
    INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y, hidden)
    VALUES ('차원의 정수 진입', 'Lv.100 도달 후 차원의 정수 트리 진입점 (무료, 구매한 paragon_points 로 분기 노드 투자 가능)', 'paragon', 'small', 0, NULL, '[]'::jsonb, '{}', 0, 0, FALSE)
    RETURNING id
  `);
  const HUB_ID = hubR.rows[0].id;
  console.log(`[OK] HUB id=${HUB_ID}`);

  // 4. 18 스포크 생성 (각 = 4 small + 1 keystone)
  for (let i = 0; i < KEYSTONES.length; i++) {
    const ks = KEYSTONES[i];
    const angle = (i * 20) * Math.PI / 180; // 20° 간격
    const SCALE = 6;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    let prevId = HUB_ID;
    // 4개 small 노드 생성 (distance 1..4)
    for (let d = 1; d <= 4; d++) {
      const tplKey = ks.small[d - 1];
      const tpl = SMALL_NODE_DEF[tplKey];
      const px = Math.round(d * SCALE * cos);
      const py = Math.round(d * SCALE * sin);
      const r = await pool.query(`
        INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y, hidden)
        VALUES ($1, $2, 'paragon', 'small', 1, NULL, $3::jsonb, $4::int[], $5, $6, FALSE)
        RETURNING id
      `, [tpl.name, tpl.desc, JSON.stringify([tpl.effect]), [prevId], px, py]);
      prevId = r.rows[0].id;
    }
    // 키스톤 노드 (distance 5)
    const kpx = Math.round(5 * SCALE * cos);
    const kpy = Math.round(5 * SCALE * sin);
    await pool.query(`
      INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y, hidden)
      VALUES ($1, $2, 'paragon', 'huge', 1, NULL, $3::jsonb, $4::int[], $5, $6, FALSE)
      RETURNING id
    `, [ks.name, ks.desc, JSON.stringify([{ type: 'passive', key: ks.key, value: 1 }]), [prevId], kpx, kpy]);
  }
  console.log(`[OK] 18 스포크 생성 (각 4 small + 1 keystone)`);

  // 5. 검증
  const cnt = await pool.query(`SELECT tier, COUNT(*)::int AS n FROM node_definitions WHERE zone = 'paragon' GROUP BY tier ORDER BY tier`);
  console.log('=== 결과 ===');
  cnt.rows.forEach(r => console.log(`  ${r.tier}: ${r.n}`));

  await pool.end();
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
