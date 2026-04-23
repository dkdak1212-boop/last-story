SET client_encoding TO 'UTF8';
-- 100제 유니크 성직자 무기 조회
SELECT id, name, grade, slot, required_level, class_restriction, stats, unique_prefix_stats, description, sell_price, set_id
FROM items
WHERE class_restriction = 'cleric'
  AND slot = 'weapon'
  AND required_level = 100
ORDER BY grade, id;
