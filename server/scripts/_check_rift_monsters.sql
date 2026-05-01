SET client_encoding TO 'UTF8';

\echo === monsters 컬럼 ===
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name='monsters' ORDER BY ordinal_position;

\echo
\echo === 균열 몬스터 ===
SELECT id, name, level, max_hp FROM monsters WHERE id BETWEEN 500 AND 599 ORDER BY id;
