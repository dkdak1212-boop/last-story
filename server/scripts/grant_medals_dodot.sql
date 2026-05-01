-- 도돋 길드 메달 10000개 지급
SET client_encoding TO 'UTF8';
BEGIN;

UPDATE characters
SET guild_boss_medals = guild_boss_medals + 10000
WHERE name = '도돋';

SELECT id, name, class_name, level, guild_boss_medals
FROM characters
WHERE name = '도돋';

COMMIT;
