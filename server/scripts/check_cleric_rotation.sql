SET client_encoding TO 'UTF8';
-- 성직자 캐릭터들의 신성방벽/심판의철퇴 auto_use/slot_order 상태
SELECT c.id, c.name, c.level,
       s.id AS skill_id, s.name AS skill,
       cs.auto_use, cs.slot_order
FROM characters c
JOIN character_skills cs ON cs.character_id = c.id
JOIN skills s ON s.id = cs.skill_id
WHERE c.class_name = 'cleric'
  AND s.id IN (95, 96, 120)
ORDER BY c.level DESC, c.id, cs.slot_order
LIMIT 40;
