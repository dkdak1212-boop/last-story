SET client_encoding TO 'UTF8';
-- hp_pct 키가 들어있는 모든 아이템 (유니크 뿐 아니라 전체)
SELECT id, name, grade, required_level, slot, class_restriction, unique_prefix_stats
FROM items
WHERE unique_prefix_stats ? 'hp_pct'
ORDER BY required_level, id;
