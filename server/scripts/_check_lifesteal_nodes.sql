SET client_encoding TO 'UTF8';

\echo === lifesteal / 흡혈 관련 노드 (효과 컬럼) ===
SELECT id, name, class_exclusive, tier, description,
       jsonb_pretty(effects) AS effects
  FROM node_definitions
 WHERE effects::text LIKE '%lifesteal%'
    OR effects::text LIKE '%crit_lifesteal%'
    OR description LIKE E'%흡혈%'
 ORDER BY class_exclusive, id;
