SET client_encoding TO 'UTF8';

\echo === BEFORE: 사하 오늘 keys_remaining ===
SELECT character_id, date, keys_remaining
  FROM guild_boss_daily
 WHERE character_id = 428
   AND date = ((NOW() AT TIME ZONE 'Asia/Seoul')::date);

BEGIN;
-- 오늘 row 없으면 생성, 있으면 +2
INSERT INTO guild_boss_daily (character_id, date, keys_remaining)
VALUES (428, ((NOW() AT TIME ZONE 'Asia/Seoul')::date), 2)
ON CONFLICT (character_id, date)
DO UPDATE SET keys_remaining = guild_boss_daily.keys_remaining + 2;

\echo === AFTER ===
SELECT character_id, date, keys_remaining
  FROM guild_boss_daily
 WHERE character_id = 428
   AND date = ((NOW() AT TIME ZONE 'Asia/Seoul')::date);
COMMIT;
