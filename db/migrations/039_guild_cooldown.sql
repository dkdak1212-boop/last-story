-- 길드 탈퇴 후 24시간 재가입/생성 쿨타임
-- 2026-04-22

BEGIN;

ALTER TABLE characters ADD COLUMN IF NOT EXISTS guild_cooldown_until TIMESTAMPTZ;

COMMIT;
