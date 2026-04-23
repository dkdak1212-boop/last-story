-- 빛의 심판 → 신의 타격 스킬 전면 개편
-- 효과: 본인 최대 HP × 50 고정 피해 × 4연타, 쿨 4행동, 크리티컬 발동 가능
BEGIN;

UPDATE skills
SET name = '신의 타격',
    description = '본인 최대 HP × 50 × 4연타 (크리티컬 발동 가능) · 쿨 4행동',
    damage_mult = 0,
    flat_damage = 0,
    kind = 'damage',
    effect_type = 'multi_hit',
    effect_value = 4,
    effect_duration = 0,
    cooldown_actions = 4
WHERE id = 136 AND class_name = 'cleric';

SELECT id, name, description, required_level, damage_mult, flat_damage, kind, effect_type, effect_value, cooldown_actions
FROM skills WHERE id = 136;

COMMIT;
