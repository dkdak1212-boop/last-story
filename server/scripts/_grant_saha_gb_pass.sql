SET client_encoding TO 'UTF8';

\echo === 사하 캐릭 확인 ===
SELECT id, name, class_name, level FROM characters WHERE name = E'사하';

\echo
\echo === 길드보스 입장키 아이템 확인 ===
SELECT id, name, type, grade, stack_size
  FROM items
 WHERE name ILIKE E'%길드 보스%' OR name ILIKE E'%입장키%' OR name ILIKE E'%보스 입장%';
