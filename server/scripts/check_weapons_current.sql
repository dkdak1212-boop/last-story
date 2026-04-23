SET client_encoding TO 'UTF8';
SELECT id, name, stats, unique_prefix_stats, description
FROM items
WHERE id IN (800, 801, 802, 803, 804, 805, 812, 813, 814)
ORDER BY id;
