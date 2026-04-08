-- 직업별 신규 스킬 4개씩 (Lv.60/65/70/75)
-- 전사: 버프1 + 디버프1 + 공격2

-- 전사 Lv.60 [버프] 전장의 포효 — 속도 +40% 버프 (3행동)
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('전장의 포효', 'warrior', 60, 'buff', 0, 0, 8, 'self_speed_mod', 40, 3);

-- 전사 Lv.65 [디버프] 갑옷 분쇄 — 적 방어력 감소 (speed_mod -50% 3행동)
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('갑옷 분쇄', 'warrior', 65, 'debuff', 0, 0, 7, 'speed_mod', -50, 3);

-- 전사 Lv.70 [공격] 지옥의 칼날 — 4.5배 + 흡혈 60%
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('지옥의 칼날', 'warrior', 70, 'damage', 4.5, 0, 6, 'lifesteal', 60, 0);

-- 전사 Lv.75 [공격] 대지의 심판 — 5배 + HP% 데미지 15%
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('대지의 심판', 'warrior', 75, 'damage', 5.0, 0, 8, 'hp_pct_damage', 15, 0);

-- 마법사 Lv.60 [버프] 마력 집중 — 속도 +50% (자기)
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('마력 집중', 'mage', 60, 'buff', 0, 0, 8, 'self_speed_mod', 50, 3);

-- 마법사 Lv.65 [디버프] 시간 왜곡 — 적 게이지 리셋 + 동결 3행동
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('시간 왜곡', 'mage', 65, 'debuff', 0, 0, 7, 'gauge_freeze', 0, 3);

-- 마법사 Lv.70 [공격] 태양의 불꽃 — 4.0배 + 강력 도트
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('태양의 불꽃', 'mage', 70, 'damage', 4.0, 120, 6, 'dot', 0, 5);

-- 마법사 Lv.75 [공격] 별의 종말 — 5.5배 자폭형 (속도 -30%)
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('별의 종말', 'mage', 75, 'damage', 5.5, 150, 9, 'self_speed_mod', -30, 0);

-- 성직자 Lv.60 [버프] 신의 축복 — 대미지 감소 40% (3행동)
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('신의 축복', 'cleric', 60, 'buff', 0, 0, 7, 'damage_reduce', 40, 3);

-- 성직자 Lv.65 [디버프] 신성 사슬 — 기절 2행동
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('신성 사슬', 'cleric', 65, 'debuff', 0, 0, 8, 'stun', 0, 2);

-- 성직자 Lv.70 [공격] 빛의 심판 — 3.5배 + 실드파괴 + 도트
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('빛의 심판', 'cleric', 70, 'damage', 3.5, 80, 6, 'dot', 0, 4);

-- 성직자 Lv.75 [공격] 천상의 낙인 — 4.5배 + 반사 100%
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('천상의 낙인', 'cleric', 75, 'damage', 4.5, 0, 8, 'damage_reflect', 100, 3);

-- 도적 Lv.60 [버프] 그림자 은신 — 게이지 즉시 충전 + 회피
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('그림자 은신', 'rogue', 60, 'buff', 0, 0, 7, 'gauge_fill', 1000, 0);

-- 도적 Lv.65 [디버프] 맹독의 안개 — 명중 디버프 50% + 독
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('맹독의 안개', 'rogue', 65, 'debuff', 0, 0, 7, 'accuracy_debuff', 50, 3);

-- 도적 Lv.70 [공격] 심장 관통 — 3.5배 + 크리보너스 40%
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('심장 관통', 'rogue', 70, 'damage', 3.5, 0, 5, 'crit_bonus', 40, 0);

-- 도적 Lv.75 [공격] 죽음의 무도 — 1.8배 x 6연타 + 독
INSERT INTO skills (name, class_name, required_level, kind, damage_mult, flat_damage, cooldown_actions, effect_type, effect_value, effect_duration)
VALUES ('죽음의 무도', 'rogue', 75, 'damage', 1.8, 0, 8, 'multi_hit_poison', 6, 0);
