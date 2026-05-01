SET client_encoding TO 'UTF8';
\echo === gauge_on_crit_pct 접두사 분포 ===
SELECT tier, min_val, max_val, name FROM item_prefixes WHERE stat_key = 'gauge_on_crit_pct' ORDER BY tier;

\echo
\echo === 다른 게이지 충전 소스 (접두사) ===
SELECT stat_key, tier, min_val, max_val, name
  FROM item_prefixes
 WHERE stat_key LIKE '%gauge%' OR stat_key LIKE '%spd%' OR stat_key LIKE '%speed%'
 ORDER BY stat_key, tier;

\echo
\echo === 캐릭별 평균 cri 분포 ===
SELECT MIN(stats->>'cri'), MAX(stats->>'cri'), AVG((stats->>'cri')::numeric)
  FROM characters WHERE total_kills > 1000;
