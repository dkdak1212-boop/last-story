const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  // ═══ 1. 소환사 스킬 ═══
  console.log('=== 스킬 등록 ===');
  await pool.query(`DELETE FROM skills WHERE class_name = 'summoner'`);

  await pool.query(`INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration) VALUES
    ('summoner', '늑대 소환',     '소환: 늑대 (MATK x80%, 5행동)',                    1,  0.80, 'damage', 0, 0, 'summon', 80, 5),
    ('summoner', '골렘 소환',     '소환: 골렘 (MATK x60%, 8행동, 받는 데미지 20% 감소)', 5,  0.60, 'damage', 4, 0, 'summon_tank', 60, 8),
    ('summoner', '지휘',         '소환수 전원 데미지 +40% 3행동 (자유 행동)',            10, 0.00, 'buff',   5, 0, 'summon_buff', 40, 3),
    ('summoner', '독수리 소환',   '소환: 독수리 (MATK x120%, 4행동, 적 속도 -20%)',     15, 1.20, 'damage', 4, 0, 'summon', 120, 4),
    ('summoner', '영혼 유대',     '소환수 지속시간 +3행동 연장 (자유 행동)',              20, 0.00, 'buff',   6, 0, 'summon_extend', 3, 0),
    ('summoner', '불정령 소환',   '소환: 불정령 (MATK x100%, 6행동, 도트)',             25, 1.00, 'damage', 5, 0, 'summon_dot', 100, 6),
    ('summoner', '총공격',       '전체 소환수 + 본체 동시 공격 (MATK x300%)',           30, 3.00, 'damage', 6, 0, 'summon_all', 0, 0),
    ('summoner', '수호수 소환',   '소환: 수호수 (MATK x50%, 10행동, HP 5% 매턴 회복)',  35, 0.50, 'damage', 7, 0, 'summon_heal', 50, 10),
    ('summoner', '야수의 분노',   '소환수 공격 2회 3행동 (자유 행동)',                   40, 0.00, 'buff',   6, 0, 'summon_frenzy', 2, 3),
    ('summoner', '드래곤 소환',   '소환: 드래곤 (MATK x200%, 5행동, 화상 도트)',        45, 2.00, 'damage', 8, 0, 'summon_dot', 200, 5),
    ('summoner', '희생',         '소환수 1마리 파괴 → 데미지 x500% 폭발',              50, 5.00, 'damage', 8, 0, 'summon_sacrifice', 500, 0),
    ('summoner', '피닉스 소환',   '소환: 피닉스 (MATK x150%, 8행동, 부활 1회)',         55, 1.50, 'damage', 10, 0, 'summon', 150, 8),
    ('summoner', '군주의 위엄',   '소환수 전원 데미지 +60% 3행동 (자유 행동)',           60, 0.00, 'buff',   7, 0, 'summon_buff', 60, 3),
    ('summoner', '하이드라 소환', '소환: 하이드라 (MATK x100% x3회, 6행동)',            65, 1.00, 'damage', 8, 0, 'summon_multi', 100, 6),
    ('summoner', '영혼 폭풍',    '소환수 수 × MATK x200% 폭발',                       70, 2.00, 'damage', 9, 0, 'summon_storm', 200, 0),
    ('summoner', '고대 용 소환',  '소환: 고대 용 (MATK x300%, 6행동, 방어 50% 무시)',   75, 3.00, 'damage', 10, 0, 'summon', 300, 6)
  `);
  console.log('스킬 16개 등록');

  // ═══ 2. 소환사 노드 ═══
  console.log('\n=== 노드 등록 ===');
  // 기존 소환사 노드 제거
  await pool.query(`DELETE FROM node_definitions WHERE class_exclusive = 'summoner'`);

  // 소형 노드 (지능/체력)
  const smallNodes = [];
  for (let i = 1; i <= 5; i++) {
    smallNodes.push(`('소환사 지능 ${i}', '지능 +5', 'south_summoner', 'small', 1, 'summoner', '[{"type":"stat","stat":"int","value":5}]', null, ${i * 2}, 0)`);
  }
  for (let i = 1; i <= 3; i++) {
    smallNodes.push(`('소환수 강화 ${i}', '소환수 데미지 +8%', 'south_summoner', 'small', 1, 'summoner', '[{"type":"passive","key":"summon_amp","value":8}]', null, ${i * 2}, 2)`);
  }
  for (let i = 1; i <= 3; i++) {
    smallNodes.push(`('소환 지속 ${i}', '소환수 지속시간 +1행동', 'south_summoner', 'small', 1, 'summoner', '[{"type":"passive","key":"summon_duration","value":1}]', null, ${i * 2}, 4)`);
  }
  smallNodes.push(`('소환사 체력 1', '체력 +5', 'south_summoner', 'small', 1, 'summoner', '[{"type":"stat","stat":"vit","value":5}]', null, 1, 6)`);
  smallNodes.push(`('소환사 체력 2', '체력 +5', 'south_summoner', 'small', 1, 'summoner', '[{"type":"stat","stat":"vit","value":5}]', null, 3, 6)`);
  smallNodes.push(`('소환사 치명 1', '치명타 +1', 'south_summoner', 'small', 1, 'summoner', '[{"type":"stat","stat":"cri","value":1}]', null, 5, 6)`);

  await pool.query(`INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y) VALUES ${smallNodes.join(',')}`);
  console.log(`소형 노드 ${smallNodes.length}개`);

  // 중형 노드
  await pool.query(`INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y) VALUES
    ('소환사 INT 증강 I', '지능 +12', 'south_summoner', 'medium', 2, 'summoner', '[{"type":"stat","stat":"int","value":12}]', null, 4, 1),
    ('소환사 INT 증강 II', '지능 +12', 'south_summoner', 'medium', 2, 'summoner', '[{"type":"stat","stat":"int","value":12}]', null, 8, 1),
    ('다중 계약', '최대 소환수 +1 (3→4마리)', 'south_summoner', 'medium', 2, 'summoner', '[{"type":"passive","key":"summon_max_extra","value":1}]', null, 6, 3),
    ('소환사 VIT 증강', '체력 +12', 'south_summoner', 'medium', 2, 'summoner', '[{"type":"stat","stat":"vit","value":12}]', null, 2, 5)
  `);
  console.log('중형 노드 4개');

  // 대형 노드 (4pt)
  await pool.query(`INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y) VALUES
    ('소환왕', '소환수 데미지 +40%, 소환 쿨다운 -1행동', 'south_summoner', 'large', 4, 'summoner', '[{"type":"passive","key":"summon_amp","value":40},{"type":"passive","key":"summon_cd_reduce","value":1}]', null, 4, 4),
    ('영혼의 지배자', '소환수 처치 시 HP 10% 회복, 소환수 데미지 -30%', 'south_summoner', 'large', 4, 'summoner', '[{"type":"passive","key":"summon_lifesteal","value":10},{"type":"passive","key":"summon_tankiness","value":30}]', null, 8, 4),
    ('계약의 대가', '소환수 데미지 +25%, 본체 데미지 -50%', 'south_summoner', 'large', 4, 'summoner', '[{"type":"passive","key":"summon_amp","value":25},{"type":"passive","key":"self_dmg_reduce","value":50}]', null, 6, 6)
  `);
  console.log('대형 노드 3개');

  // 초월 노드 (8pt)
  await pool.query(`INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y) VALUES
    ('만물의 군주', '소환수 데미지 +80%, 20% 확률 2회 타격', 'south_summoner', 'huge', 8, 'summoner', '[{"type":"passive","key":"summon_amp","value":80},{"type":"passive","key":"summon_double_hit","value":20}]', null, 3, 8),
    ('영원의 계약자', '소환수 지속시간 무한, 데미지 +30%', 'south_summoner', 'huge', 8, 'summoner', '[{"type":"passive","key":"summon_infinite","value":1},{"type":"passive","key":"summon_amp","value":30}]', null, 9, 8)
  `);
  console.log('초월 노드 2개');

  // ═══ 3. 직업 확인 ═══
  const skills = await pool.query(`SELECT name, required_level, kind, effect_type FROM skills WHERE class_name = 'summoner' ORDER BY required_level`);
  console.log('\n=== 소환사 스킬 목록 ===');
  for (const s of skills.rows) console.log(`  Lv.${s.required_level} ${s.name} [${s.kind}] ${s.effect_type}`);

  const nodes = await pool.query(`SELECT name, tier, cost FROM node_definitions WHERE class_exclusive = 'summoner' ORDER BY tier, cost`);
  console.log(`\n노드 ${nodes.rows.length}개 등록 완료`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
