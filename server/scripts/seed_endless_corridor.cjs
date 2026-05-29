// 종언의 회랑 (Lv.120 상시 사냥터) — 몬스터 7종 + 필드 시드
// 설계 근거: 실측 DPS 곡선(기둥 한계층 역산) 기준 — 중위 유저(15억/s) 일반몹 처치 ~10초.
//   → 회랑 = "중상위 티어 상시 파밍터" (갓 만렙은 균열 110에서 성장 후 입성).
// 확정값: 일반 160억 / 정예 380억 / 보스(준레이드) 1,000억, 기본타 ~36k(위협 유지).
//
// 동작 보장 범위:
//  - HP·atk·def·dr_pct·cc_immune: 일반 스폰 경로(engine.ts:5944~)가 그대로 적용.
//  - level=120 → highTierMult ×3.0 (atk=str×3, matk=int×1.2×3), CC저항 70% 자동.
//  - 몬스터 스킬: 실제 동작하는 id 만 사용 → dim_burst / heal_seal / time_warp / rage / phase2_summon.
//    (그 외 id 는 engine 핸들러가 없어 무효이므로 사용하지 않음.)
//
// ⚠️ 미구현 의존(별도 PR 필요 — 접두사 ⑤ "치명 관통"과 같은 PR):
//  - crit_resist (치명타 저항): engine.ts 에 신규 로직 필요. stats 에 키만 박아둠(현재 무효).
//  - 보스(606)는 field monster_pool 에 넣지 않음 — 1,000억 준레이드를 2% 랜덤 조우로 두면
//    약자/중위 UX 가 깨짐. 전용 스폰(타이머/소환 아이템)은 후속 과제. 정의만 시드.
//
// 멱등성: ON CONFLICT (id) DO UPDATE. 반복 실행 안전.
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const FIELD_ID = 24;
const MAT_FRAG = 852;     // 차원 파편
const MAT_ESSENCE = 853;  // 시공의 정수
const MAT_CORE = 854;     // 균열의 핵

// 일반 5종(600~604) + 정예 1종(605) + 보스 1종(606)
const NORMAL_IDS = [600, 601, 602, 603, 604];
const ELITE_ID = 605;

const HP_NORMAL = 16_000_000_000;   // 160억 — 중위(15억/s) ~10초
const HP_ELITE = 38_000_000_000;    // 380억 — 중위 ~24초
const HP_BOSS = 100_000_000_000;    // 1,000억 — 중위 ~67초 (다인/최상위용)

(async () => {
  console.log('=== 종언의 회랑 시드 시작 ===');

  // 1) 몬스터 7종
  await pool.query(`
    INSERT INTO monsters (id, name, level, max_hp, exp_reward, gold_reward, stats, drop_table, avg_kill_time_sec, skills) VALUES
    -- 일반 5종 (HP 160억, def 250k, dr_pct 30, str 12000→atk 36k). crit_resist 45(현재 무효).
    (600, '공허의 추적자', 120, ${HP_NORMAL}, 3000000, 500000,
       '{"str":12000,"dex":120,"int":150,"vit":2000,"spd":135,"cri":15,"def":250000,"mdef":250000,"dr_pct":30,"crit_resist":45}'::jsonb,
       '[{"itemId":${MAT_FRAG},"chance":0.25,"minQty":1,"maxQty":3}]'::jsonb, 10,
       '[{"id":"time_warp","name":"시공 붕괴","cooldown":9,"effect":"slow_40_force"}]'::jsonb),
    (601, '종언의 망령', 120, ${HP_NORMAL}, 3000000, 500000,
       '{"str":300,"dex":90,"int":12000,"vit":2000,"spd":110,"cri":12,"def":250000,"mdef":250000,"dr_pct":30,"crit_resist":45,"matk_based":true}'::jsonb,
       '[{"itemId":${MAT_FRAG},"chance":0.25,"minQty":1,"maxQty":3}]'::jsonb, 10,
       '[{"id":"heal_seal","name":"종언의 봉인","cooldown":12,"effect":"heal_block_8s"}]'::jsonb),
    (602, '심판의 집행자', 120, ${HP_NORMAL}, 3000000, 500000,
       '{"str":12500,"dex":110,"int":150,"vit":2000,"spd":115,"cri":18,"def":250000,"mdef":250000,"dr_pct":30,"crit_resist":45}'::jsonb,
       '[{"itemId":${MAT_FRAG},"chance":0.25,"minQty":1,"maxQty":3}]'::jsonb, 10,
       '[{"id":"dim_burst","name":"심판의 일격","cooldown":9,"effect":"def_pierce_50","atk_mult":2.0}]'::jsonb),
    (603, '소멸의 파수꾼', 120, ${HP_NORMAL}, 3000000, 500000,
       '{"str":11000,"dex":80,"int":120,"vit":2500,"spd":100,"cri":10,"def":290000,"mdef":290000,"dr_pct":33,"crit_resist":45}'::jsonb,
       '[{"itemId":${MAT_FRAG},"chance":0.25,"minQty":1,"maxQty":3}]'::jsonb, 11,
       '[{"id":"dim_burst","name":"소멸의 강타","cooldown":11,"effect":"def_pierce_50","atk_mult":1.8}]'::jsonb),
    (604, '절규하는 그림자', 120, ${HP_NORMAL}, 3000000, 500000,
       '{"str":12000,"dex":140,"int":150,"vit":2000,"spd":140,"cri":20,"def":250000,"mdef":250000,"dr_pct":30,"crit_resist":45}'::jsonb,
       '[{"itemId":${MAT_FRAG},"chance":0.25,"minQty":1,"maxQty":3},{"itemId":${MAT_ESSENCE},"chance":0.05,"minQty":1,"maxQty":1}]'::jsonb, 10,
       '[{"id":"dim_burst","name":"절규","cooldown":10,"effect":"def_pierce_50","atk_mult":2.0},{"id":"rage","name":"광기","trigger":"hp_below_50","effect":"atk_x2_spd_x2"}]'::jsonb),
    -- 정예 1종 (HP 380억, def 300k, dr_pct 35, str 16000→atk 48k)
    (${ELITE_ID}, '회랑의 학살자', 120, ${HP_ELITE}, 9000000, 1500000,
       '{"str":16000,"dex":150,"int":200,"vit":3000,"spd":125,"cri":22,"def":300000,"mdef":300000,"dr_pct":35,"crit_resist":60,"is_elite":true}'::jsonb,
       '[{"itemId":${MAT_FRAG},"chance":0.40,"minQty":2,"maxQty":4},{"itemId":${MAT_ESSENCE},"chance":0.12,"minQty":1,"maxQty":1}]'::jsonb, 24,
       '[{"id":"dim_burst","name":"학살","cooldown":8,"effect":"def_pierce_50","atk_mult":2.5},{"id":"heal_seal","name":"피의 봉인","cooldown":14,"effect":"heal_block_8s"},{"id":"rage","name":"학살 본능","trigger":"hp_below_50","effect":"atk_x2_spd_x2"}]'::jsonb),
    -- 보스 1종 (HP 1,000억, def 350k, dr_pct 40, cc_immune, str 25000→atk 75k). crit_resist 90(현재 무효).
    (606, '회랑의 지배자', 120, ${HP_BOSS}, 200000000, 30000000,
       '{"str":25000,"dex":120,"int":400,"vit":5000,"spd":130,"cri":25,"def":350000,"mdef":350000,"dr_pct":40,"crit_resist":90,"cc_immune":true}'::jsonb,
       '[{"itemId":${MAT_FRAG},"chance":0.60,"minQty":5,"maxQty":10},{"itemId":${MAT_ESSENCE},"chance":0.30,"minQty":2,"maxQty":4},{"itemId":${MAT_CORE},"chance":0.08,"minQty":1,"maxQty":2}]'::jsonb, 60,
       '[{"id":"dim_burst","name":"종언 선고","cooldown":8,"effect":"def_pierce_50","atk_mult":3.0},{"id":"heal_seal","name":"절망의 봉인","cooldown":20,"effect":"heal_block_8s"},{"id":"time_warp","name":"시간 정지","cooldown":30,"effect":"slow_40_force"},{"id":"phase2_summon","name":"종언 개방","trigger":"hp_below_50","effect":"enrage_30"}]'::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      name=EXCLUDED.name, level=EXCLUDED.level, max_hp=EXCLUDED.max_hp,
      exp_reward=EXCLUDED.exp_reward, gold_reward=EXCLUDED.gold_reward,
      stats=EXCLUDED.stats, drop_table=EXCLUDED.drop_table,
      avg_kill_time_sec=EXCLUDED.avg_kill_time_sec, skills=EXCLUDED.skills
  `);
  console.log('[OK] 몬스터 7종 (600~606)');

  // 2) 필드 24 — 종언의 회랑. 보스(606)는 풀에서 제외(전용 스폰 후속). 정예 ~5%, 일반 균등.
  const monsterPool = [];
  for (const id of NORMAL_IDS) for (let i = 0; i < 19; i++) monsterPool.push(id); // 95
  for (let i = 0; i < 5; i++) monsterPool.push(ELITE_ID);                          // 5  → 정예 5%
  await pool.query(
    `INSERT INTO fields (id, name, required_level, monster_pool, description)
     VALUES ($1, '종언의 회랑', 100, $2::jsonb,
             '시공의 균열 너머, 종언으로 이어지는 회랑. 만렙 도달 후 입장하는 상시 사냥터. 막대한 EXP와 골드를 제공한다.')
     ON CONFLICT (id) DO UPDATE SET
       name=EXCLUDED.name, required_level=EXCLUDED.required_level,
       monster_pool=EXCLUDED.monster_pool, description=EXCLUDED.description`,
    [FIELD_ID, JSON.stringify(monsterPool)]
  );
  console.log('[OK] 필드 24 종언의 회랑 (일반 95% / 정예 5%, 보스 제외)');

  // 3) 시퀀스 동기화
  await pool.query(`SELECT setval('monsters_id_seq', GREATEST((SELECT MAX(id) FROM monsters), 606))`);
  console.log('[OK] monsters_id_seq 동기화');

  console.log('=== 완료 ===');
  await pool.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
