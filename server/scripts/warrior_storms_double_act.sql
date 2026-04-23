-- 무쌍난무 / 전장의 광란: 전체 세트 2회 발동 확률 추가
BEGIN;

UPDATE skills
SET description = '4.86배 × 3연타 · 25% 확률 2회 발동 · 25% 확률 다른 스킬 쿨 초기화 · 쿨 5행동'
WHERE class_name = 'warrior' AND name = '무쌍난무';

UPDATE skills
SET description = '4.5배 × 5연타 · 50% 확률 2회 발동 · 50% 확률 다른 스킬 쿨 초기화 · 쿨 8행동'
WHERE class_name = 'warrior' AND name = '전장의 광란';

SELECT id, name, description, damage_mult, effect_value, cooldown_actions
FROM skills WHERE class_name = 'warrior' AND name IN ('무쌍난무', '전장의 광란');

COMMIT;
