SET client_encoding TO 'UTF8';
-- 소환사 노드 전부 및 effect key 추출
SELECT id, name, tier, class_exclusive, effects
FROM node_definitions
WHERE class_exclusive = 'summoner'
   OR (effects::text LIKE '%summon_%' OR effects::text LIKE '%aura_%')
ORDER BY id;
