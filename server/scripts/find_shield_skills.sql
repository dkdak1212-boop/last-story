SET client_encoding TO 'UTF8';
SELECT id, name, effect_type, kind, damage_mult, effect_value, effect_duration, cooldown_actions, required_level
FROM skills WHERE id IN (95, 96, 120, 121);
