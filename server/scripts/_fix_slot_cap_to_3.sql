SET client_encoding TO 'UTF8';

\echo === BEFORE ===
SELECT max_character_slots, COUNT(*)::int FROM users GROUP BY max_character_slots ORDER BY 1 NULLS FIRST;

BEGIN;

-- 명시적 2 로 설정된 사용자 → 3 으로 일괄 UPDATE
UPDATE users SET max_character_slots = 3
 WHERE max_character_slots = 2;

-- 컬럼 default 도 2 → 3 (신규 유저는 자동 3)
ALTER TABLE users ALTER COLUMN max_character_slots SET DEFAULT 3;

COMMIT;

\echo === AFTER ===
SELECT max_character_slots, COUNT(*)::int FROM users GROUP BY max_character_slots ORDER BY 1 NULLS FIRST;

\echo === 신규 default 확인 ===
SELECT column_default FROM information_schema.columns
 WHERE table_name='users' AND column_name='max_character_slots';
