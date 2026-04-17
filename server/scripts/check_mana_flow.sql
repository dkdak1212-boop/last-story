SET client_encoding TO 'UTF8';
BEGIN;
UPDATE node_definitions SET description = '모든 스킬 쿨다운 -1행동' WHERE id = 133;
SELECT id, name, description, effects FROM node_definitions WHERE id = 133;
COMMIT;
