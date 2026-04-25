// 시공의 균열 (Lv.110) 마이그레이션 — 어드민 전용 진입
// - items.bound_on_pickup 컬럼
// - monsters.skills 컬럼 (Phase 2 에서 활용)
// - 필드 id=23 시공의 균열
// - 몬스터 3종 (id 500,501,502)
// - 재료 3종 (id 852,853,854) + 통행증 (id 855, 추후 사용)
// - 110제 아이템 10종 (id 900~909)
// - 110제 세트 + 레시피
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const FIELD_ID = 23;
const MAT_FRAG = 852, MAT_ESSENCE = 853, MAT_CORE = 854, ITEM_PASS = 855;
const MON_GRUNT = 500, MON_ELITE = 501, MON_BOSS = 502;
// 110제 아이템 ID (900~909)
const I110 = {
  weapon_warrior: 900, weapon_mage: 901, weapon_cleric: 902, weapon_rogue: 903, weapon_summoner: 904,
  helm: 905, chest: 906, boots: 907, ring: 908, amulet: 909,
};

(async () => {
  console.log('=== Rift 110 migration ===');

  // 1. items 컬럼
  await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS bound_on_pickup BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`SELECT setval(pg_get_serial_sequence('items', 'id'), GREATEST((SELECT MAX(id) FROM items), 0) + 1, false)`);
  console.log('[OK] items.bound_on_pickup + sequence sync');

  // 2. monsters 컬럼
  await pool.query(`ALTER TABLE monsters ADD COLUMN IF NOT EXISTS skills JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`SELECT setval(pg_get_serial_sequence('monsters', 'id'), GREATEST((SELECT MAX(id) FROM monsters), 0) + 1, false)`);
  console.log('[OK] monsters.skills + sequence sync');

  // 3. 멱등성 — 기존 110 콘텐츠 정리
  await pool.query(`DELETE FROM craft_recipes WHERE name LIKE '110제%' OR name LIKE '%시공의 균열%'`);
  await pool.query(`DELETE FROM character_inventory WHERE item_id IN (${[MAT_FRAG, MAT_ESSENCE, MAT_CORE, ITEM_PASS, ...Object.values(I110)].join(',')})`);
  await pool.query(`DELETE FROM character_equipped WHERE item_id IN (${Object.values(I110).join(',')})`);
  await pool.query(`DELETE FROM items WHERE id IN (${[MAT_FRAG, MAT_ESSENCE, MAT_CORE, ITEM_PASS, ...Object.values(I110)].join(',')})`);
  await pool.query(`DELETE FROM monsters WHERE id IN (${MON_GRUNT}, ${MON_ELITE}, ${MON_BOSS})`);
  await pool.query(`DELETE FROM fields WHERE id = ${FIELD_ID}`);
  await pool.query(`DELETE FROM item_sets WHERE name = '시공의 균열 세트'`);
  console.log('[OK] 기존 110 콘텐츠 정리');

  // 4. 재료 + 통행증 아이템
  await pool.query(`
    INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price, required_level, bound_on_pickup) VALUES
    (${MAT_FRAG},    '차원 파편',     'material', 'unique', NULL, '{}'::jsonb, '시공의 균열에서 떨어지는 차원 파편. 110제 방어구 제작 재료.',          999,    10, 100, TRUE),
    (${MAT_ESSENCE}, '시공의 정수',   'material', 'unique', NULL, '{}'::jsonb, '엘리트 몬스터에서만 드롭. 110제 악세서리 제작 재료.',                999,    50, 100, TRUE),
    (${MAT_CORE},    '균열의 핵',     'material', 'unique', NULL, '{}'::jsonb, '필드보스에서만 드롭. 110제 무기 제작에 필요한 핵심 재료.',           999,   500, 100, TRUE),
    (${ITEM_PASS},   '차원의 통행증', 'consumable','unique', NULL, '{}'::jsonb, '시공의 균열 입장권. 1회 입장에 1장 소모.',                          99,      0, 100, TRUE)
  `);
  console.log('[OK] 재료 4종');

  // 5. 110제 세트
  const setR = await pool.query(`
    INSERT INTO item_sets (name, boss_name, set_bonus_2, set_bonus_4, set_bonus_6, description)
    VALUES ('시공의 균열 세트', '균열의 군주',
      '{"damage_taken_down_pct": 10}'::jsonb,
      '{"atk_pct": 15, "matk_pct": 15}'::jsonb,
      '{"hp_regen": 300}'::jsonb,
      '시공의 균열에서 제작된 차원 장비 세트. 6세트 시 전투 내 부활 1회 (resurrect_count_extra).')
    RETURNING id
  `);
  const SET_110 = setR.rows[0].id;
  console.log('[OK] 110제 세트 id=' + SET_110);

  // 6. 110제 아이템 10종
  // 무기: 베이스 atk/matk = 100제 ×2.5 (~2500)
  // 방어구: HP/def = 100제 ×1.5
  // 신규 unique 옵션 키 적용 (engine.ts 추후 보강)
  await pool.query(`
    INSERT INTO items (id, name, type, grade, slot, stats, unique_prefix_stats, class_restriction, description, stack_size, sell_price, required_level, set_id, bound_on_pickup) VALUES
    (${I110.weapon_warrior},  '시공 분쇄 대검',     'weapon', 'unique', 'weapon', '{"atk":2520,"hp":900,"str":35}'::jsonb,
       '{"atk_pct":18,"execute_pct":200,"def_convert_atk":5}'::jsonb, 'warrior', '균열의 핵으로 단조한 차원의 대검.',                                    1, 100000, 100, ${SET_110}, TRUE),
    (${I110.weapon_mage},     '시공 분쇄 지팡이',   'weapon', 'unique', 'weapon', '{"matk":2520,"hp":900,"int":35}'::jsonb,
       '{"matk_pct":18,"execute_pct":200,"undispellable":1}'::jsonb,  'mage',    '시공의 정수가 깃든 지팡이.',                                          1, 100000, 100, ${SET_110}, TRUE),
    (${I110.weapon_cleric},   '시공 분쇄 홀',       'weapon', 'unique', 'weapon', '{"matk":2480,"hp":1200,"int":30,"vit":10}'::jsonb,
       '{"matk_pct":15,"shield_on_low_hp":30,"undispellable":1}'::jsonb, 'cleric','신성과 차원의 결합으로 빚어진 홀.',                                  1, 100000, 100, ${SET_110}, TRUE),
    (${I110.weapon_rogue},    '시공 분쇄 단검',     'weapon', 'unique', 'weapon', '{"atk":2500,"hp":850,"dex":40}'::jsonb,
       '{"atk_pct":15,"execute_pct":200,"reflect_skill":50}'::jsonb,  'rogue',   '차원의 균열을 가르는 단검.',                                          1, 100000, 100, ${SET_110}, TRUE),
    (${I110.weapon_summoner}, '시공 분쇄 보주',     'weapon', 'unique', 'weapon', '{"matk":2400,"hp":900,"int":40}'::jsonb,
       '{"matk_pct":15,"summon_amp":30,"summon_max_extra":1}'::jsonb, 'summoner','소환수에게 차원의 힘을 부여하는 보주.',                                1, 100000, 100, ${SET_110}, TRUE),
    (${I110.helm},   '시공 분쇄 투구',  'armor', 'unique', 'helm',  '{"hp":1500,"def":225,"vit":20}'::jsonb,
       '{"max_hp_pct":15,"shield_on_low_hp":25}'::jsonb, NULL, '차원의 빛을 발하는 투구. 6세트 부활 효과 적용.', 1, 80000, 100, ${SET_110}, TRUE),
    (${I110.chest},  '시공 분쇄 갑옷',  'armor', 'unique', 'chest', '{"hp":2400,"def":345,"vit":25}'::jsonb,
       '{"max_hp_pct":18,"def_convert_atk":5}'::jsonb,    NULL, '몬스터 스킬을 50% 반사하는 갑옷.', 1, 80000, 100, ${SET_110}, TRUE),
    (${I110.boots},  '시공 분쇄 신발',  'armor', 'unique', 'boots', '{"hp":1200,"def":195,"spd":30,"dodge":10}'::jsonb,
       '{"spd_pct":15,"reflect_skill":30}'::jsonb,        NULL, '차원의 잔재를 흩뿌리는 신발.', 1, 80000, 100, ${SET_110}, TRUE),
    (${I110.ring},   '시공의 반지',     'accessory', 'unique', 'ring',   '{"cri":15,"crit_dmg":35,"dex":15}'::jsonb,
       '{"crit_dmg_pct":50,"execute_pct":100}'::jsonb,    NULL, '치명타에 차원의 힘을 더하는 반지.', 1, 80000, 100, ${SET_110}, TRUE),
    (${I110.amulet}, '시공의 목걸이',   'accessory', 'unique', 'amulet', '{"hp":1000,"cri":10,"int":15,"str":15}'::jsonb,
       '{"atk_pct":10,"matk_pct":10,"undispellable":1}'::jsonb, NULL, '시공을 잇는 목걸이.', 1, 80000, 100, ${SET_110}, TRUE)
  `);
  console.log('[OK] 110제 아이템 10종');

  // 7. 몬스터 3종 (skills JSONB — Phase 2 에서 engine.ts 가 활용)
  await pool.query(`
    INSERT INTO monsters (id, name, level, max_hp, exp_reward, gold_reward, stats, drop_table, skills) VALUES
    (${MON_GRUNT}, '차원의 잔재', 110, 200000000, 800000, 80000,
       '{"str":250,"dex":180,"int":200,"vit":300,"spd":110,"cri":15,"def":30000,"mdef":30000,"dr_pct":50,"cc_immune":true}'::jsonb,
       '[{"itemId":${MAT_FRAG},"chance":0.20,"minQty":1,"maxQty":3}]'::jsonb,
       '[{"id":"dim_burst","name":"차원 파열","cooldown":15,"effect":"def_pierce_50","atk_mult":2.0}]'::jsonb),
    (${MON_ELITE}, '시공의 수호자', 110, 400000000, 1500000, 150000,
       '{"str":350,"dex":250,"int":280,"vit":400,"spd":120,"cri":20,"def":40000,"mdef":40000,"dr_pct":55,"cc_immune":true}'::jsonb,
       '[{"itemId":${MAT_FRAG},"chance":0.30,"minQty":2,"maxQty":4},{"itemId":${MAT_ESSENCE},"chance":0.10,"minQty":1,"maxQty":1}]'::jsonb,
       '[{"id":"dim_burst","name":"차원 파열","cooldown":15,"effect":"def_pierce_50","atk_mult":2.0},{"id":"heal_seal","name":"치유 봉쇄","cooldown":20,"effect":"heal_block_8s"},{"id":"rage","name":"분노","trigger":"hp_below_40","effect":"atk_80_spd_50"}]'::jsonb),
    (${MON_BOSS}, '균열의 군주', 110, 1500000000, 5000000, 500000,
       '{"str":500,"dex":350,"int":400,"vit":600,"spd":130,"cri":25,"def":50000,"mdef":50000,"dr_pct":60,"cc_immune":true,"unconditionalDodge":false}'::jsonb,
       '[{"itemId":${MAT_FRAG},"chance":0.50,"minQty":3,"maxQty":6},{"itemId":${MAT_ESSENCE},"chance":0.20,"minQty":2,"maxQty":3},{"itemId":${MAT_CORE},"chance":0.05,"minQty":1,"maxQty":1}]'::jsonb,
       '[{"id":"dim_burst","name":"차원 파열","cooldown":15,"effect":"def_pierce_50","atk_mult":2.5},{"id":"heal_seal","name":"치유 봉쇄","cooldown":20,"effect":"heal_block_8s"},{"id":"time_warp","name":"시공 왜곡","cooldown":30,"effect":"slow_40_force"},{"id":"phase2_summon","name":"차원 균열 소환","trigger":"hp_below_50","effect":"summon_grunts_3"}]'::jsonb)
  `);
  console.log('[OK] 몬스터 3종 (id 500-502)');

  // 8. 필드 id=23 시공의 균열 (인카운터 뽑기 80/19/1 — monster_pool 에 가중치 표현)
  // 현재 pickRandomMonster 가 단순 ORDER BY RANDOM() 이므로 등장률 비례를 위해 monster_pool 에 중복 입력
  // grunt × 80, elite × 19, boss × 1 → 총 100 개
  const pool110 = [];
  for (let i = 0; i < 80; i++) pool110.push(MON_GRUNT);
  for (let i = 0; i < 19; i++) pool110.push(MON_ELITE);
  pool110.push(MON_BOSS);
  await pool.query(`
    INSERT INTO fields (id, name, required_level, monster_pool, description) VALUES
    ($1, $2, $3, $4::jsonb, $5)
  `, [FIELD_ID, '시공의 균열', 100, JSON.stringify(pool110),
      'Lv.100 이후 최종 컨텐츠. 차원 파편을 모아 110제 장비를 제작하라. (어드민 베타 테스트 중)']);
  console.log(`[OK] 필드 id=${FIELD_ID} 시공의 균열 (몬스터 풀 ${pool110.length}개 — 80/19/1 가중)`);

  // 9. 제작 레시피 — 단일 재료 모델 활용
  // craft_recipes: name / material_item_id / material_qty / result_type / result_item_ids[] / set_id
  await pool.query(`
    INSERT INTO craft_recipes (name, material_item_id, material_qty, result_type, result_item_ids, set_id) VALUES
    ('110제 방어구 제작 (차원 파편 500)',     ${MAT_FRAG},    500, 'pick',  ARRAY[${I110.helm}, ${I110.chest}, ${I110.boots}], ${SET_110}),
    ('110제 악세서리 제작 (시공의 정수 500)', ${MAT_ESSENCE}, 500, 'pick',  ARRAY[${I110.ring}, ${I110.amulet}],                ${SET_110}),
    ('110제 무기 제작 (균열의 핵 25)',         ${MAT_CORE},     25, 'class_locked', ARRAY[${I110.weapon_warrior}, ${I110.weapon_mage}, ${I110.weapon_cleric}, ${I110.weapon_rogue}, ${I110.weapon_summoner}], ${SET_110})
  `);
  console.log('[OK] 레시피 3종');

  // 10. 검증
  const cnt = await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM items WHERE id BETWEEN ${MAT_FRAG} AND ${ITEM_PASS}) AS materials,
    (SELECT COUNT(*)::int FROM items WHERE id BETWEEN 900 AND 909) AS items110,
    (SELECT COUNT(*)::int FROM monsters WHERE id BETWEEN ${MON_GRUNT} AND ${MON_BOSS}) AS monsters,
    (SELECT 1::int FROM fields WHERE id = ${FIELD_ID}) AS field,
    (SELECT COUNT(*)::int FROM craft_recipes WHERE name LIKE '110제%') AS recipes,
    (SELECT 1::int FROM item_sets WHERE id = ${SET_110}) AS set110
  `);
  console.log('=== 검증 ===');
  console.log(cnt.rows[0]);

  await pool.end();
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
