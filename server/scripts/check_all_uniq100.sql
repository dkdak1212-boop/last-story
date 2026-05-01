SET client_encoding TO 'UTF8';
SELECT id, name, slot, class_restriction, stats, unique_prefix_stats, description
FROM items
WHERE grade = 'unique'
  AND required_level = 100
ORDER BY class_restriction NULLS LAST, slot, id;
