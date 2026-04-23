SELECT id, name, description, required_level, damage_mult, flat_damage, kind, effect_type, effect_value, effect_duration, cooldown_actions
FROM skills
WHERE class_name = 'warrior' AND name IN ('무쌍난무', '전장의 광란');
