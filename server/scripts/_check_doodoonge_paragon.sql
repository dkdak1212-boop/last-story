SET client_encoding TO 'UTF8';

\echo === 1) 두둥게 캐릭 기본 + paragon ===
SELECT id, name, class_name, level, gold, node_points, paragon_points
  FROM characters WHERE name = E'두둥게';

\echo
\echo === 2) node_definitions 컬럼 확인 (paragon 표식 컬럼?) ===
SELECT column_name FROM information_schema.columns
 WHERE table_name='node_definitions' ORDER BY ordinal_position;

\echo
\echo === 3) 두둥게 character_nodes 전체 ===
SELECT cn.node_id, cn.tier_unlocked, nd.name, nd.zone, nd.size
  FROM character_nodes cn
  JOIN node_definitions nd ON nd.id = cn.node_id
 WHERE cn.character_id = (SELECT id FROM characters WHERE name = E'두둥게')
 ORDER BY cn.node_id;

\echo
\echo === 4) paragon 존 / 사이즈 추정 ===
SELECT zone, size, COUNT(*) FROM node_definitions GROUP BY zone, size ORDER BY zone, size;
