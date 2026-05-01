SET client_encoding TO 'UTF8';
\echo === BEFORE ===
SELECT id, name, node_points, paragon_points FROM characters WHERE name = E'두둥게';

UPDATE characters SET paragon_points = COALESCE(paragon_points, 0) + 1
 WHERE name = E'두둥게';

\echo === AFTER ===
SELECT id, name, node_points, paragon_points FROM characters WHERE name = E'두둥게';
