SET client_encoding TO 'UTF8';

\echo === 캐릭 확인 ===
SELECT id, name, class_name, level FROM characters
 WHERE name IN (E'맛밤', E'꿀밤');

BEGIN;
INSERT INTO guild_boss_daily (character_id, date, keys_remaining)
SELECT c.id, ((NOW() AT TIME ZONE 'Asia/Seoul')::date), 2
  FROM characters c
 WHERE c.name IN (E'맛밤', E'꿀밤')
ON CONFLICT (character_id, date)
DO UPDATE SET keys_remaining = guild_boss_daily.keys_remaining + 2;

\echo === AFTER ===
SELECT gbd.character_id, c.name, gbd.date, gbd.keys_remaining
  FROM guild_boss_daily gbd
  JOIN characters c ON c.id = gbd.character_id
 WHERE c.name IN (E'맛밤', E'꿀밤')
   AND gbd.date = ((NOW() AT TIME ZONE 'Asia/Seoul')::date);
COMMIT;
