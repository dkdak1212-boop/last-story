SET client_encoding TO 'UTF8';

\echo === BEFORE: online_exp_rate < 0 인 캐릭 ===
SELECT COUNT(*)::int FROM characters WHERE online_exp_rate < 0;

BEGIN;

-- 음수 EMA → 0 으로 리셋. 다음 사냥 시 정상 갱신 시작 (EMA 정규화 갱신 정책 적용).
UPDATE characters SET online_exp_rate = 0
 WHERE online_exp_rate < 0;

\echo === AFTER ===
SELECT COUNT(*)::int FROM characters WHERE online_exp_rate < 0;

COMMIT;
