-- 4배 캐릭 → Lv100 / node 100 / stat 200 세팅
BEGIN;

SELECT id, name, class_name, level, hp, max_hp, node_points, stat_points FROM characters WHERE name = '4배';

UPDATE characters
SET level = 100,
    exp = 0,
    max_hp = 2675,
    hp = 2675,
    node_points = 100,
    stat_points = 200
WHERE name = '4배';

SELECT id, name, class_name, level, exp, hp, max_hp, node_points, stat_points FROM characters WHERE name = '4배';

COMMIT;
