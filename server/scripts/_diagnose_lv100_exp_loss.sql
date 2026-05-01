SET client_encoding TO 'UTF8';

\echo === Lv.100 캐릭 현재 상태 ===
SELECT COUNT(*)::int AS total_lv100,
       COUNT(*) FILTER (WHERE exp = 0)::int AS exp_zero,
       COUNT(*) FILTER (WHERE exp > 0)::int AS exp_remain,
       SUM(exp)::text AS total_exp_remain,
       AVG(exp)::text AS avg_exp_remain,
       SUM(paragon_points)::int AS total_paragon_points
  FROM characters WHERE level >= 100;

\echo
\echo === Lv.100 캐릭 분포 (exp 0 인 케이스) ===
SELECT id, name, class_name, exp, paragon_points,
       online_exp_rate, last_offline_settled_at
  FROM characters
 WHERE level >= 100 AND exp = 0
 ORDER BY total_kills DESC LIMIT 15;
