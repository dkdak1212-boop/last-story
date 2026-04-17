SET client_encoding TO 'UTF8';
SELECT id, name, description, effect_type, effect_value, effect_duration, damage_mult, flat_damage, kind, class_name, required_level
FROM skills WHERE name IN ('신성방벽', '심판의 철퇴') OR (class_name='cleric' AND name LIKE '%심판%');
