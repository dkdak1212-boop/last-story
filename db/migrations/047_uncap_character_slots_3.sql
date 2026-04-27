-- 계정당 캐릭터 슬롯 2 → 3 으로 환원 (정책 변경)
-- 2026-04-22 의 마이그레이션 040 으로 2 로 줄였던 것을 다시 3 으로.
-- 어드민 / 운영용 999 슬롯 계정은 건드리지 않음.
-- 2026-04-27

BEGIN;

UPDATE users
SET max_character_slots = 3
WHERE NOT is_admin
  AND max_character_slots < 3;

SELECT max_character_slots, is_admin, COUNT(*) AS n
FROM users
GROUP BY max_character_slots, is_admin
ORDER BY max_character_slots NULLS FIRST, is_admin;

COMMIT;
