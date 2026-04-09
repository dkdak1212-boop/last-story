-- ==========================================
-- 클래스 밸런스 패치
-- ==========================================

-- 마법사 강화:
-- 1. 기본 SPD 250 → 300 (전사와 동급)
-- 2. 기본 VIT 8 → 10 (생존력 개선)
-- 3. 스킬 self_speed_mod 페널티 완화
-- (시작 스탯은 classes.ts에서, 여기선 스킬만)

-- 마력 과부하: -50% → -20%
UPDATE skills SET effect_value = -20 WHERE name = '마력 과부하' AND class_name = 'mage';
-- 차원 붕괴: -40% → -15%
UPDATE skills SET effect_value = -15 WHERE name = '차원 붕괴' AND class_name = 'mage';
-- 별의 종말: -30% → -10%
UPDATE skills SET effect_value = -10 WHERE name = '별의 종말' AND class_name = 'mage';

-- 마법사 기본기(화염구) flat_damage 30 → 50
UPDATE skills SET flat_damage = 50 WHERE name = '화염구' AND class_name = 'mage';

-- 도적 하향:
-- 기본 CRI 12 → 8
-- 기본 SPD 400 → 350
-- (시작 스탯은 classes.ts에서)

-- 도적 급소 찌르기 크리보너스 20 → 15
UPDATE skills SET effect_value = 15 WHERE name = '급소 찌르기' AND class_name = 'rogue';
-- 암살 크리보너스 30 → 20
UPDATE skills SET effect_value = 20 WHERE name = '암살' AND class_name = 'rogue';
-- 심장 관통 크리보너스 40 → 25
UPDATE skills SET effect_value = 25 WHERE name = '심장 관통' AND class_name = 'rogue';

-- 성직자 강화:
-- 치유의 빛 25% → 30%
UPDATE skills SET effect_value = 30 WHERE name = '치유의 빛' AND class_name = 'cleric';
-- 정화의 빛 35% → 40%
UPDATE skills SET effect_value = 40 WHERE name = '정화의 빛' AND class_name = 'cleric';
-- 신성 방벽 실드 20% → 25%
UPDATE skills SET effect_value = 25 WHERE name = '신성 방벽' AND class_name = 'cleric';
-- 천상의 방벽 실드 40% → 50%
UPDATE skills SET effect_value = 50 WHERE name = '천상의 방벽' AND class_name = 'cleric';
-- 기본 SPD 200 → 250
-- (시작 스탯은 classes.ts에서)
