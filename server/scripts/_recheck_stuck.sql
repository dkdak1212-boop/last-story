SET client_encoding TO 'UTF8';

\echo === 다시 점검: online_exp_rate=0 인데 사냥 중 ===
SELECT COUNT(*)::int AS stuck_now
  FROM characters
 WHERE online_exp_rate = 0 AND online_gold_rate > 0;

\echo
\echo === 누구? ===
SELECT id, name, class_name, level, online_gold_rate, online_kill_rate,
       (event_exp_until > NOW()) AS event_active,
       event_exp_max_level, location
  FROM characters
 WHERE online_exp_rate = 0 AND online_gold_rate > 0
 ORDER BY online_gold_rate DESC LIMIT 20;
