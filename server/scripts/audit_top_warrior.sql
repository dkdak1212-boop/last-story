SET client_encoding TO 'UTF8';

-- Top 5 전사 by level+exp
\echo '=== Top 5 warriors ==='
SELECT c.id, c.name, c.level, c.exp, c.gold, c.total_kills, c.total_gold_earned,
       c.node_points,
       (SELECT COUNT(*) FROM character_nodes WHERE character_id=c.id) AS allocated_nodes,
       c.hp, c.max_hp, c.stat_points
FROM characters c
WHERE c.class_name = 'warrior'
ORDER BY c.level DESC, c.exp DESC LIMIT 5;

-- #1 warrior detailed
\echo ''
\echo '=== #1 warrior stats ==='
SELECT id, name, level, exp, gold, stats, max_enhance_level, created_at, last_online_at,
       (SELECT COUNT(*) FROM character_inventory WHERE character_id=c.id) AS inv_count,
       (SELECT COUNT(*) FROM character_equipped WHERE character_id=c.id) AS eq_count
FROM characters c
WHERE class_name='warrior' ORDER BY level DESC, exp DESC LIMIT 1;

-- #1 warrior equipment
\echo ''
\echo '=== #1 warrior equipment ==='
WITH top AS (SELECT id FROM characters WHERE class_name='warrior' ORDER BY level DESC, exp DESC LIMIT 1)
SELECT ce.slot, i.name, ce.enhance_level, ce.quality, ce.prefix_ids, ce.prefix_stats
FROM character_equipped ce
JOIN items i ON i.id = ce.item_id
WHERE ce.character_id = (SELECT id FROM top);

-- #1 warrior playtime / created
\echo ''
\echo '=== #1 warrior playtime ==='
SELECT id, name, level, created_at, last_online_at,
       EXTRACT(EPOCH FROM (last_online_at - created_at))/3600 AS hours_total
FROM characters WHERE class_name='warrior' ORDER BY level DESC, exp DESC LIMIT 1;

-- Level distribution for context
\echo ''
\echo '=== Level distribution (top 20) ==='
SELECT id, name, class_name, level, total_kills, gold
FROM characters ORDER BY level DESC, exp DESC LIMIT 20;
