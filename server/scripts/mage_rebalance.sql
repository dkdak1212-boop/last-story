-- 마법사 밸런스 패치: CC 패시브 → 도트 패시브, 마력 과부하 재설계

-- 1) 마력 과부하: 순수 자가 강화 버프로 재설계
--    기존: MATK x578% 단일 공격 (CD 8)
--    신규: 자기 스피드 -25%, 3행동 지속 (자유 행동, CD 6)
--         디버프 중 마법 데미지 +80% (엔진 하드코드)
UPDATE skills
SET kind             = 'buff',
    damage_mult      = 0.00,
    flat_damage      = 0,
    effect_type      = 'self_speed_mod',
    effect_value     = -25,
    effect_duration  = 3,
    cooldown_actions = 5,
    description      = '자신 스피드 25% 감소 3행동 · 디버프 중 마법 데미지 +80% (자유 행동)'
WHERE name = '마력 과부하' AND class_name = 'mage';

-- 2) 모든 마법사 스킬 툴팁의 CC 보너스 문구 → 도트 보너스 문구로 교체
UPDATE skills
SET description = REPLACE(description, ' · CC(동결/기절) 적에게 +50%', ' · 도트 적에게 +30%')
WHERE class_name = 'mage'
  AND description LIKE '% · CC(동결/기절) 적에게 +50%%';
