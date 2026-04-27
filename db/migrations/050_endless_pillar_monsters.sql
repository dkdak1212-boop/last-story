-- 종언의 기둥 — 신규 몬스터 5종 (일반) + 10종 (보스) 시드
-- base 능력치: Lv.110 시공균열 일반 몬스터 (500, 501) 평균의 ÷2 (인터뷰 11-1)
-- 보스 base: 일반 base × 8 (인터뷰 11-2)
-- runtime 에 floor 별 +2.5% 가산 적용 (engine 에서 스케일링)
-- drop_table = [] (D6.2 자동 보상 없음 정책)
-- 2026-04-27

-- 일반 몬스터 5종 (503~507) — 일반층에서 5종 풀에서 랜덤 추첨
INSERT INTO monsters (id, name, level, max_hp, exp_reward, gold_reward, stats, drop_table, avg_kill_time_sec, skills) VALUES
  (503, '망자의 그림자', 1, 600000000, 0, 0,
   '{"cri":12,"def":35000,"dex":50,"int":120,"spd":115,"str":656,"vit":175,"mdef":18000,"dr_pct":26}'::jsonb,
   '[]'::jsonb, 10,
   '[{"id":"shadow_slash","name":"그림자 가르기","atk_mult":1.5,"effect":"acc_down_50_1act","trigger_chance":0.3,"cooldown":4}]'::jsonb),
  (504, '차원의 사냥꾼', 1, 600000000, 0, 0,
   '{"cri":18,"def":35000,"dex":80,"int":100,"spd":125,"str":656,"vit":175,"mdef":18000,"dr_pct":26}'::jsonb,
   '[]'::jsonb, 10,
   '[{"id":"track_blade","name":"추적의 칼날","atk_mult":1.0,"hits":3,"effect":"crit_bonus_20_last_hit","cooldown":5}]'::jsonb),
  (505, '영겁의 잔재', 1, 600000000, 0, 0,
   '{"cri":15,"def":30000,"dex":40,"int":280,"spd":110,"str":300,"vit":175,"mdef":22000,"dr_pct":26,"matk_based":true}'::jsonb,
   '[]'::jsonb, 10,
   '[{"id":"time_erosion","name":"시간 침식","atk_mult":0.8,"effect":"dot_max_hp_pct_0_3_5turn","matk":true,"cooldown":4}]'::jsonb),
  (506, '침묵의 수도자', 1, 600000000, 0, 0,
   '{"cri":10,"def":32000,"dex":40,"int":260,"spd":110,"str":400,"vit":175,"mdef":24000,"dr_pct":26,"matk_based":true}'::jsonb,
   '[]'::jsonb, 10,
   '[{"id":"silence_seal","name":"침묵의 봉인","atk_mult":0.6,"effect":"player_gauge_-50_1act","cooldown":6}]'::jsonb),
  (507, '종언의 첨병', 1, 900000000, 0, 0,
   '{"cri":8,"def":50000,"dex":30,"int":80,"spd":100,"str":820,"vit":300,"mdef":24000,"dr_pct":35}'::jsonb,
   '[]'::jsonb, 12,
   '[{"id":"heavy_blow","name":"묵직한 강타","atk_mult":2.0,"effect":"self_gauge_-30","cooldown":5}]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, level = EXCLUDED.level, max_hp = EXCLUDED.max_hp,
  stats = EXCLUDED.stats, drop_table = EXCLUDED.drop_table,
  avg_kill_time_sec = EXCLUDED.avg_kill_time_sec, skills = EXCLUDED.skills;

-- 보스 10종 (508~517) — 100/200/300.../1000층 보스 (1001층+ 순환)
-- base = 일반 × 8 (HP 4.8B, str 5250, def 280K, mdef 144K, vit 1400)
INSERT INTO monsters (id, name, level, max_hp, exp_reward, gold_reward, stats, drop_table, avg_kill_time_sec, skills) VALUES
  -- 100층: 깨어난 수문장 — 거대 갑옷 골렘. 분쇄 일격 + 수호 자세
  (508, '깨어난 수문장', 1, 4800000000, 0, 0,
   '{"cri":15,"def":280000,"dex":40,"int":200,"spd":120,"str":5250,"vit":1400,"mdef":144000,"dr_pct":35,"cc_immune":true}'::jsonb,
   '[]'::jsonb, 30,
   '[{"id":"crush_strike","name":"분쇄의 일격","atk_mult":3.0,"cooldown":4},{"id":"guardian_stance","name":"수호의 자세","effect":"self_dr_+30_5act","trigger":"hp_below_50","cooldown":99}]'::jsonb),
  -- 200층: 시간의 포식자 — 게이지 흡수 + 시간역행 회복
  (509, '시간의 포식자', 1, 4800000000, 0, 0,
   '{"cri":20,"def":260000,"dex":50,"int":350,"spd":135,"str":5250,"vit":1400,"mdef":160000,"dr_pct":35,"cc_immune":true}'::jsonb,
   '[]'::jsonb, 30,
   '[{"id":"time_drain","name":"시간 흡수","atk_mult":1.5,"effect":"player_gauge_-50","cooldown":5},{"id":"time_rewind","name":"시간역행","effect":"self_heal_15_pct","cooldown":8}]'::jsonb),
  -- 300층: 균열의 폭군 — 다단공격 + 차원 분쇄
  (510, '균열의 폭군', 1, 4800000000, 0, 0,
   '{"cri":22,"def":280000,"dex":80,"int":250,"spd":125,"str":5250,"vit":1400,"mdef":144000,"dr_pct":40,"cc_immune":true}'::jsonb,
   '[]'::jsonb, 30,
   '[{"id":"rift_strike","name":"균열 강타","atk_mult":1.0,"hits":5,"effect":"bleed_25_per_hit","cooldown":6},{"id":"dim_crush","name":"차원 분쇄","atk_mult":3.5,"effect":"def_pierce_50","cooldown":8}]'::jsonb),
  -- 400층: 무한의 환영 — 분신 회피 + 환영 폭발
  (511, '무한의 환영', 1, 4800000000, 0, 0,
   '{"cri":25,"def":280000,"dex":100,"int":300,"spd":140,"str":5250,"vit":1400,"mdef":160000,"dr_pct":40,"cc_immune":true}'::jsonb,
   '[]'::jsonb, 30,
   '[{"id":"phantom_clone","name":"환영 분신","effect":"self_dmg_taken_-50_4act","trigger":"hp_below_70","cooldown":10},{"id":"phantom_burst","name":"환영 폭발","atk_mult":4.0,"cooldown":12}]'::jsonb),
  -- 500층: 종말의 기수 (마일스톤) — 진군 + 강림
  (512, '종말의 기수', 1, 4800000000, 0, 0,
   '{"cri":25,"def":300000,"dex":80,"int":280,"spd":135,"str":5800,"vit":1400,"mdef":160000,"dr_pct":42,"cc_immune":true}'::jsonb,
   '[]'::jsonb, 30,
   '[{"id":"apocal_march","name":"종말의 진군","atk_mult":2.5,"hits":3,"cooldown":5},{"id":"death_descent","name":"죽음의 강림","atk_mult":5.0,"effect":"player_dmg_taken_+30_5act","cooldown":10}]'::jsonb),
  -- 600층: 절멸의 권능 — 마법 광역 + 쿨다운 봉인
  (513, '절멸의 권능', 1, 4800000000, 0, 0,
   '{"cri":20,"def":260000,"dex":50,"int":500,"spd":125,"str":3000,"vit":1400,"mdef":200000,"dr_pct":40,"cc_immune":true,"matk_based":true}'::jsonb,
   '[]'::jsonb, 30,
   '[{"id":"annihilate","name":"절멸 폭발","atk_mult":4.0,"effect":"def_pierce_70","matk":true,"cooldown":6},{"id":"power_seal","name":"권능의 봉인","effect":"player_skill_cd_+2","cooldown":7}]'::jsonb),
  -- 700층: 영원의 파수자 — 흡혈 + 결계
  (514, '영원의 파수자', 1, 4800000000, 0, 0,
   '{"cri":22,"def":280000,"dex":70,"int":250,"spd":130,"str":5500,"vit":1500,"mdef":160000,"dr_pct":42,"cc_immune":true}'::jsonb,
   '[]'::jsonb, 30,
   '[{"id":"eternal_lash","name":"영원의 채찍","atk_mult":1.8,"hits":4,"effect":"lifesteal_30","cooldown":5},{"id":"watcher_shield","name":"파수의 결계","effect":"self_shield_max_hp_50","cooldown":12}]'::jsonb),
  -- 800층: 차원 군주 — 광역 도트 + 공격력 자버프
  (515, '차원 군주', 1, 4800000000, 0, 0,
   '{"cri":25,"def":300000,"dex":80,"int":350,"spd":135,"str":5800,"vit":1500,"mdef":180000,"dr_pct":45,"cc_immune":true}'::jsonb,
   '[]'::jsonb, 30,
   '[{"id":"dim_rift","name":"차원 균열","atk_mult":3.0,"effect":"dot_max_hp_pct_1_5turn","cooldown":6},{"id":"reign_decree","name":"군림의 선언","effect":"self_atk_x1_5_6act","cooldown":8}]'::jsonb),
  -- 900층: 끝없는 심판자 — 즉사형 일격 + HP50% 추가행동
  (516, '끝없는 심판자', 1, 4800000000, 0, 0,
   '{"cri":30,"def":300000,"dex":100,"int":300,"spd":140,"str":6000,"vit":1500,"mdef":180000,"dr_pct":45,"cc_immune":true}'::jsonb,
   '[]'::jsonb, 30,
   '[{"id":"judgement_strike","name":"심판의 일격","atk_mult":6.0,"cooldown":5},{"id":"merciless","name":"무자비","effect":"extra_action_once","trigger":"player_hp_below_50"}]'::jsonb),
  -- 1000층: 종언 그 자체 — 다단 + 강제 치명 + HP30% 회복
  (517, '종언 그 자체', 1, 4800000000, 0, 0,
   '{"cri":35,"def":320000,"dex":120,"int":400,"spd":145,"str":6500,"vit":2000,"mdef":200000,"dr_pct":50,"cc_immune":true}'::jsonb,
   '[]'::jsonb, 30,
   '[{"id":"end_descent","name":"종언의 강림","atk_mult":4.0,"hits":4,"effect":"force_crit_last_hit","cooldown":6},{"id":"infinity_seal","name":"무한 봉인","effect":"player_gauge_-100_skill_cd_+3","cooldown":15},{"id":"immortal_will","name":"불멸의 의지","effect":"self_heal_50_once","trigger":"hp_below_30"}]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, level = EXCLUDED.level, max_hp = EXCLUDED.max_hp,
  stats = EXCLUDED.stats, drop_table = EXCLUDED.drop_table,
  avg_kill_time_sec = EXCLUDED.avg_kill_time_sec, skills = EXCLUDED.skills;

-- monsters_id_seq 보정
SELECT setval('monsters_id_seq', GREATEST((SELECT MAX(id) FROM monsters), 517));
