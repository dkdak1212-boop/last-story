SET client_encoding TO 'UTF8';
SELECT id, class_name, name, description, effect_type, damage_mult, effect_value, effect_duration, cooldown_actions, required_level
FROM skills
ORDER BY class_name, required_level;
