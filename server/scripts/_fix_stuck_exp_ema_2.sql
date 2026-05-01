SET client_encoding TO 'UTF8';

\echo === 남은 stuck 캐릭 ===
SELECT id, name, class_name, level, online_gold_rate, location
  FROM characters
 WHERE online_exp_rate = 0 AND online_gold_rate > 0
 ORDER BY level;

\echo
\echo === FIX 2: 같은 클래스 + 레벨 ±5 범위 평균 ===
BEGIN;
UPDATE characters c1
   SET online_exp_rate = (
     SELECT AVG(c2.online_exp_rate)
       FROM characters c2
      WHERE c2.class_name = c1.class_name
        AND c2.level BETWEEN c1.level - 5 AND c1.level + 5
        AND c2.online_exp_rate > 0
   )
 WHERE c1.online_exp_rate = 0
   AND c1.online_gold_rate > 0
   AND EXISTS (
     SELECT 1 FROM characters c3
      WHERE c3.class_name = c1.class_name
        AND c3.level BETWEEN c1.level - 5 AND c1.level + 5
        AND c3.online_exp_rate > 0
   );

\echo
\echo === FIX 3: 그래도 stuck 이면 동일 사냥터 평균 (클래스 무관) ===
UPDATE characters c1
   SET online_exp_rate = (
     SELECT AVG(c2.online_exp_rate)
       FROM characters c2
      WHERE c2.location = c1.location
        AND c2.online_exp_rate > 0
   )
 WHERE c1.online_exp_rate = 0
   AND c1.online_gold_rate > 0
   AND c1.location LIKE 'field:%'
   AND EXISTS (
     SELECT 1 FROM characters c3
      WHERE c3.location = c1.location
        AND c3.online_exp_rate > 0
   );

\echo
\echo === AFTER ===
SELECT COUNT(*)::int AS still_stuck
  FROM characters
 WHERE online_exp_rate = 0 AND online_gold_rate > 0;

COMMIT;
