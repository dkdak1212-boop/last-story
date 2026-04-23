SELECT id, name, description, required_level, damage_mult, flat_damage, kind, effect_type, effect_value, effect_duration, cooldown_actions
FROM skills
WHERE class_name = 'cleric' AND (name LIKE '%빛의%심판%' OR name LIKE '%빛의 심판%');

-- 클래릭 전체 스킬 목록도
SELECT id, name, required_level, damage_mult, kind, effect_type, effect_value, cooldown_actions
FROM skills WHERE class_name = 'cleric' ORDER BY required_level;
