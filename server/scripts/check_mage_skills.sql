SELECT id, name, required_level, damage_mult, flat_damage, kind, effect_type, effect_value, cooldown_actions
FROM skills
WHERE class_name = 'mage'
ORDER BY required_level;
