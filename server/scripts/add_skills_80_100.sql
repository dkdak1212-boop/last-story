SET client_encoding TO 'UTF8';
BEGIN;

-- ============================================================
-- Lv 80 ~ 100 신규 스킬 20개 (4직업 × 5레벨)
-- ============================================================

-- 전사 (warrior)
INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration)
VALUES
  ('warrior', '파멸의 일격', 'ATK x1000% + 적 현재 HP 12% 추가 데미지', 80, 10.00, 'damage', 7, 0, 'hp_pct_damage', 12, 0),
  ('warrior', '절대 파괴', 'ATK x1100%, 방어 100% 무시', 85, 11.00, 'damage', 7, 0, 'damage', 0, 0),
  ('warrior', '전장의 광란', 'ATK x450% x 5회', 90, 4.50, 'damage', 8, 0, 'multi_hit', 5, 0),
  ('warrior', '피의 향연', 'ATK x1150% + 흡혈 80%', 95, 11.50, 'damage', 8, 0, 'lifesteal', 80, 0),
  ('warrior', '대멸절', 'ATK x1450%, 방어 100% 무시', 100, 14.50, 'damage', 10, 0, 'damage', 0, 0);

-- 마법사 (mage)
INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration)
VALUES
  ('mage', '절대 영역', 'MATK x400% + 적 게이지 동결 4행동', 80, 4.00, 'damage', 9, 0, 'gauge_freeze', 0, 4),
  ('mage', '마나 폭주', 'MATK x1050% + INT 1당 1000 고정 추가', 85, 10.50, 'damage', 7, 0, 'damage', 0, 0),
  ('mage', '시공 붕괴', 'MATK x1050% + 도트 6행동', 90, 10.50, 'damage', 8, 0, 'dot', 0, 6),
  ('mage', '원소 대폭발', 'MATK x500% x 4회', 95, 5.00, 'damage', 9, 0, 'multi_hit', 4, 0),
  ('mage', '창세의 빛', 'MATK x1600%, 50% 확률 2회 발동', 100, 16.00, 'damage', 12, 0, 'double_chance', 50, 0);

-- 성직자 (cleric)
INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration)
VALUES
  ('cleric', '대심판의 철퇴', 'MATK x900% + 실드값 x6 추가 데미지', 80, 9.00, 'damage', 6, 0, 'shield_break', 0, 0),
  ('cleric', '빛의 축복', '최대 HP 50% 회복 + ATK/MATK +50% 3행동 (자유)', 85, 0.00, 'buff', 10, 0, 'atk_buff', 50, 3),
  ('cleric', '신성의 갑주', '최대 HP 80% 실드 4행동 (자유)', 90, 0.00, 'buff', 10, 0, 'shield', 80, 4),
  ('cleric', '심판자의 권능', 'MATK x1200%, 자신 실드 보유 시 +50% 추가', 95, 12.00, 'damage', 8, 0, 'damage', 0, 0),
  ('cleric', '천상 강림', 'MATK x1500% 심판 4행동 + 즉시 HP 40% 회복', 100, 15.00, 'damage', 11, 0, 'judgment_day', 50, 4);

-- 도적 (rogue)
INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration)
VALUES
  ('rogue', '독의 축제', '독 스택 400% 즉시 폭발', 80, 0.00, 'damage', 7, 0, 'poison_burst', 400, 0),
  ('rogue', '기습', '게이지 800 충전 + 다음 공격 치명타 확정 (자유)', 85, 0.00, 'buff', 8, 0, 'gauge_fill', 800, 0),
  ('rogue', '천 개의 칼날', 'ATK x330% x 7회 + 독 중첩', 90, 3.30, 'damage', 8, 0, 'multi_hit_poison', 7, 0),
  ('rogue', '치명 절격', 'ATK x900%, 50% 확률 2회 발동', 95, 9.00, 'damage', 9, 0, 'double_chance', 50, 0),
  ('rogue', '암흑의 심판', 'ATK x1400% + 독 스택당 +10% 추가', 100, 14.00, 'damage', 11, 0, 'damage', 0, 0);

SELECT id, class_name, name, required_level, damage_mult, effect_type, cooldown_actions
FROM skills WHERE required_level >= 80 ORDER BY class_name, required_level;

COMMIT;
