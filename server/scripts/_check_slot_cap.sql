SET client_encoding TO 'UTF8';

\echo === max_character_slots 분포 ===
SELECT max_character_slots, COUNT(*)::int AS users
  FROM users
 GROUP BY max_character_slots
 ORDER BY max_character_slots NULLS FIRST;
