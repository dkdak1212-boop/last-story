SET client_encoding TO 'UTF8';

\echo === BEFORE ===
SELECT id, name, description FROM node_definitions WHERE id = 988;

UPDATE node_definitions
   SET description = E'자신 도트 데미지 ×2, 매 행동 자신 max_hp 8% 깎임'
 WHERE id = 988;

\echo === AFTER ===
SELECT id, name, description FROM node_definitions WHERE id = 988;
