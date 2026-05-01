-- 암흑, 네크로 길드 메달 1500개씩 지급
SET client_encoding TO 'UTF8';
BEGIN;

UPDATE characters
SET guild_boss_medals = guild_boss_medals + 1500
WHERE name IN ('암흑','네크로');

SELECT id, name, class_name, level, guild_boss_medals
FROM characters
WHERE name IN ('암흑','네크로');

COMMIT;
