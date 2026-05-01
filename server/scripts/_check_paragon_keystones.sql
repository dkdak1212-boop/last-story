SET client_encoding TO 'UTF8';

\echo === paragon 키스톤(huge) 18종 정의 ===
SELECT id, name, class_exclusive AS cls,
       jsonb_pretty(effects) AS effects,
       hidden
  FROM node_definitions
 WHERE zone = 'paragon' AND tier = 'huge'
 ORDER BY id;

\echo
\echo === 활성 투자 현황 ===
SELECT nd.id, nd.name, COUNT(cn.character_id) AS invested
  FROM node_definitions nd
  LEFT JOIN character_nodes cn ON cn.node_id = nd.id
 WHERE nd.zone = 'paragon' AND nd.tier = 'huge'
 GROUP BY nd.id, nd.name
 ORDER BY nd.id;
