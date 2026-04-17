SET client_encoding TO 'UTF8';
BEGIN;

UPDATE node_definitions
SET description = '스킬 20% 확률로 두 번 발동',
    effects = '[{"key": "skill_double_chance", "type": "passive", "value": 20}]'::jsonb
WHERE id = 217;

SELECT id, name, description, effects FROM node_definitions WHERE id = 217;

COMMIT;
