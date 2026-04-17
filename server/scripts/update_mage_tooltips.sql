SET client_encoding TO 'UTF8';
BEGIN;

-- 마법사 데미지 스킬에 CC 보너스 표기 추가
UPDATE skills
SET description = description || ' · CC(동결/기절) 적에게 +50%'
WHERE class_name = 'mage' AND damage_mult > 0
  AND description NOT LIKE '%CC(동결/기절)%';

SELECT id, name, description FROM skills
WHERE class_name = 'mage' ORDER BY required_level;

COMMIT;
