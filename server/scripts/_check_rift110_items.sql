SET client_encoding TO 'UTF8';

\echo === 110레벨 아이템 (또는 시공균열 표식) ===
SELECT id, name, type, slot, grade, required_level,
       jsonb_pretty(stats) AS stats,
       jsonb_pretty(unique_prefix_stats) AS unique_prefix_stats,
       description
  FROM items
 WHERE required_level >= 110 OR name ILIKE '%균열%' OR name ILIKE '%시공%' OR name ILIKE '%차원%'
 ORDER BY required_level DESC NULLS LAST, slot, id;
