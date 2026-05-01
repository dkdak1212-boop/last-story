SET client_encoding TO 'UTF8';

\echo === BEFORE ===
SELECT COUNT(*)::int FROM characters WHERE online_exp_rate = 0 AND online_gold_rate > 0;

BEGIN;

-- 동일 사냥터+동일 클래스 평균
UPDATE characters c1 SET online_exp_rate = (
  SELECT AVG(c2.online_exp_rate) FROM characters c2
   WHERE c2.location = c1.location AND c2.class_name = c1.class_name AND c2.online_exp_rate > 0
) WHERE c1.online_exp_rate = 0 AND c1.online_gold_rate > 0
  AND c1.location LIKE 'field:%'
  AND EXISTS (SELECT 1 FROM characters c3 WHERE c3.location = c1.location AND c3.class_name = c1.class_name AND c3.online_exp_rate > 0);

-- 동일 클래스 + 레벨 ±5
UPDATE characters c1 SET online_exp_rate = (
  SELECT AVG(c2.online_exp_rate) FROM characters c2
   WHERE c2.class_name = c1.class_name AND c2.level BETWEEN c1.level - 5 AND c1.level + 5 AND c2.online_exp_rate > 0
) WHERE c1.online_exp_rate = 0 AND c1.online_gold_rate > 0
  AND EXISTS (SELECT 1 FROM characters c3 WHERE c3.class_name = c1.class_name AND c3.level BETWEEN c1.level - 5 AND c1.level + 5 AND c3.online_exp_rate > 0);

-- 동일 클래스 (레벨 무관)
UPDATE characters c1 SET online_exp_rate = (
  SELECT AVG(c2.online_exp_rate) FROM characters c2
   WHERE c2.class_name = c1.class_name AND c2.online_exp_rate > 0
) WHERE c1.online_exp_rate = 0 AND c1.online_gold_rate > 0
  AND EXISTS (SELECT 1 FROM characters c3 WHERE c3.class_name = c1.class_name AND c3.online_exp_rate > 0);

\echo === AFTER ===
SELECT COUNT(*)::int FROM characters WHERE online_exp_rate = 0 AND online_gold_rate > 0;

COMMIT;
