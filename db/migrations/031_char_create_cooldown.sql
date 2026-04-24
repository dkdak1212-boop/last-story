-- 캐릭터 삭제 후 8시간 내 재생성 차단 — users 테이블에 마지막 삭제 시각 영속화
SET client_encoding TO 'UTF8';
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_char_deleted_at TIMESTAMPTZ;

COMMIT;
