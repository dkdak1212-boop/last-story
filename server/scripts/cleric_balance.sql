SET client_encoding TO 'UTF8';
BEGIN;

-- 천상의 방벽 CD 8 -> 5
UPDATE skills SET cooldown_actions = 5 WHERE id = 120;

-- 신성의 갑주 CD 10 -> 7
UPDATE skills SET cooldown_actions = 7 WHERE id = 186;

-- 심판의 철퇴: 실드 비례 데미지 400% 명확화 (코드는 이미 ×4 = 400%)
UPDATE skills SET description = 'MATK x330% + 50, 실드 비례 400% 추가 + 최대 HP 10% 추가' WHERE id = 96;

SELECT id, name, description, cooldown_actions, effect_duration FROM skills WHERE id IN (120, 186, 96);

COMMIT;
