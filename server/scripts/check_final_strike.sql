SELECT id, name, description, damage_mult, flat_damage, kind, effect_type, effect_value, cooldown_actions
FROM skills WHERE class_name = 'warrior' AND name = '최후의 일격';

-- 접두사 lifesteal_pct 관련 접두사
SELECT id, name, stat_type, tier_values FROM prefixes WHERE stat_type LIKE '%lifesteal%' OR name LIKE '%흡혈%';
