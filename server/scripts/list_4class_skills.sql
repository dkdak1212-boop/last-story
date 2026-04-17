SET client_encoding TO 'UTF8';
SELECT id, class_name, name, description, effect_type, damage_mult, effect_value, effect_duration, cooldown_actions, flat_damage
FROM skills
WHERE class_name IN ('warrior', 'mage', 'cleric', 'rogue')
ORDER BY class_name, required_level;
