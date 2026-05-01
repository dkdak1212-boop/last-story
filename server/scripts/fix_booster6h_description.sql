-- 6시간 부스터 패키지 설명을 실제 효과(EXP/골드/드랍 3종)에 맞춰 수정
SET client_encoding TO 'UTF8';
BEGIN;

UPDATE guild_boss_shop_items
SET description = 'EXP/골드/드랍 3종 +50% 6시간 동시 부스트'
WHERE id = 6;

SELECT id, name, description FROM guild_boss_shop_items WHERE id = 6;

COMMIT;
