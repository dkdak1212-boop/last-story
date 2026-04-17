SET client_encoding TO 'UTF8';
BEGIN;
-- 마력의 흐름: cooldown_reduce 13% 제거 → 설명대로 -1 행동만 적용
UPDATE node_definitions
SET effects = '[{"key": "mana_flow", "type": "passive", "value": 1}]'::jsonb
WHERE id = 133;

SELECT id, name, description, effects FROM node_definitions WHERE id IN (303, 133);
COMMIT;
