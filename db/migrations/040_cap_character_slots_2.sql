-- 계정당 캐릭터 생성 2개 제한
-- 어드민(is_admin=TRUE) 와 운영용 999슬롯 계정은 제외
-- 기존 캐릭터는 삭제하지 않음 — 3개 보유자는 유지되고 추가 생성만 차단
-- 2026-04-22

BEGIN;

UPDATE users
SET max_character_slots = 2
WHERE NOT is_admin
  AND max_character_slots > 2
  AND max_character_slots < 999;

-- 확인
SELECT max_character_slots, is_admin, COUNT(*) AS n
FROM users
GROUP BY max_character_slots, is_admin
ORDER BY max_character_slots NULLS FIRST, is_admin;

COMMIT;
