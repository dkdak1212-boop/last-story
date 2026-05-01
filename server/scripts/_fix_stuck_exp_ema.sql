SET client_encoding TO 'UTF8';

\echo === BEFORE: online_exp_rate=0 인데 사냥 중인 캐릭 (online_gold_rate>0) ===
SELECT COUNT(*)::int AS stuck_count
  FROM characters
 WHERE online_exp_rate = 0
   AND online_gold_rate > 0;

\echo
\echo === 샘플 10명 (영향 케이스) ===
SELECT id, name, class_name, level, online_exp_rate, online_gold_rate, online_kill_rate,
       event_exp_until, event_exp_max_level, location
  FROM characters
 WHERE online_exp_rate = 0
   AND online_gold_rate > 0
 ORDER BY online_gold_rate DESC LIMIT 10;

\echo
\echo === FIX: 같은 사냥터+같은 클래스의 평균 EMA 적용 ===
BEGIN;
UPDATE characters c1
   SET online_exp_rate = (
     SELECT AVG(c2.online_exp_rate)
       FROM characters c2
      WHERE c2.location = c1.location
        AND c2.class_name = c1.class_name
        AND c2.online_exp_rate > 0
   )
 WHERE c1.online_exp_rate = 0
   AND c1.online_gold_rate > 0
   AND c1.location LIKE 'field:%'
   AND EXISTS (
     SELECT 1 FROM characters c3
      WHERE c3.location = c1.location
        AND c3.class_name = c1.class_name
        AND c3.online_exp_rate > 0
   );

\echo
\echo === AFTER ===
SELECT COUNT(*)::int AS still_stuck
  FROM characters
 WHERE online_exp_rate = 0
   AND online_gold_rate > 0;

\echo
\echo === 보정된 캐릭 샘플 ===
SELECT id, name, class_name, level, online_exp_rate, online_gold_rate, location
  FROM characters
 WHERE online_gold_rate > 0
 ORDER BY id DESC LIMIT 5;

COMMIT;
