SET client_encoding TO 'UTF8';

\echo === BEFORE ===
SELECT id, name, description FROM node_definitions
 WHERE description LIKE E'%심판 데미지%' ORDER BY id;

BEGIN;
UPDATE node_definitions
   SET description = REPLACE(description, E'심판 데미지', E'스킬 데미지')
 WHERE description LIKE E'%심판 데미지%';

\echo === AFTER ===
SELECT id, name, description FROM node_definitions
 WHERE description LIKE E'%스킬 데미지%' ORDER BY id;

\echo === 잔여 (변경 누락 케이스 — '심판 데미지' 표기가 다른 띄어쓰기) ===
SELECT id, name, description FROM node_definitions
 WHERE description LIKE E'%심판%' AND description LIKE E'%데미지%'
 ORDER BY id;
COMMIT;
