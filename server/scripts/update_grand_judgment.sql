SET client_encoding TO 'UTF8';
BEGIN;

UPDATE skills
SET effect_value = 10,
    description = 'MATK x900% + 실드 비례 800% 추가 + 최대 HP 10% 추가'
WHERE id = 184;

SELECT id, name, description, effect_value FROM skills WHERE id = 184;

COMMIT;
