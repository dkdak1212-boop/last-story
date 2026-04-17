SET client_encoding TO 'UTF8';
-- 공식: 시작 1점 (Lv1), 레벨업당 +1 → 총점 = level
SELECT c.id, c.name, c.level,
       c.node_points AS free,
       COALESCE(n.cnt, 0) AS allocated,
       c.node_points + COALESCE(n.cnt, 0) AS total,
       (c.node_points + COALESCE(n.cnt, 0)) - c.level AS excess
FROM characters c
LEFT JOIN (
  SELECT character_id, COUNT(*)::int AS cnt FROM character_nodes GROUP BY character_id
) n ON n.character_id = c.id
WHERE (c.node_points + COALESCE(n.cnt, 0)) > c.level
ORDER BY excess DESC;
