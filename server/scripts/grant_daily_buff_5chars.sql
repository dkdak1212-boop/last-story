-- 분노/나태/둥둥/일단/이단 5명에게 일일임무 버프(EXP/골드/드랍 +50%) 24시간 지급
-- 기존 버프 남아있으면 그 중 더 긴 쪽을 유지
SET client_encoding TO 'UTF8';
BEGIN;

UPDATE characters
SET exp_boost_until  = GREATEST(COALESCE(exp_boost_until,  NOW()), NOW() + INTERVAL '24 hours'),
    gold_boost_until = GREATEST(COALESCE(gold_boost_until, NOW()), NOW() + INTERVAL '24 hours'),
    drop_boost_until = GREATEST(COALESCE(drop_boost_until, NOW()), NOW() + INTERVAL '24 hours')
WHERE name IN ('분노','나태','둥둥','일단','이단');

SELECT id, name, class_name, level,
       exp_boost_until  AT TIME ZONE 'Asia/Seoul' AS exp_kst,
       gold_boost_until AT TIME ZONE 'Asia/Seoul' AS gold_kst,
       drop_boost_until AT TIME ZONE 'Asia/Seoul' AS drop_kst
FROM characters
WHERE name IN ('분노','나태','둥둥','일단','이단')
ORDER BY name;

COMMIT;
