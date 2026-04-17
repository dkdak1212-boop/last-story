SET client_encoding TO 'UTF8';
BEGIN;

-- 마법사 CC 스킬 데미지 배율 상향 (레벨대별)
-- 기존 vs 변경
UPDATE skills SET damage_mult = 4.00,  description = REPLACE(description, 'MATK x330%', 'MATK x400%') WHERE id = 91;   -- Lv15 번개 사슬
UPDATE skills SET damage_mult = 3.50,  description = REPLACE(description, 'MATK x150%', 'MATK x350%') WHERE id = 92;   -- Lv20 빙결 감옥
UPDATE skills SET damage_mult = 5.50,  description = REPLACE(description, 'MATK x297%', 'MATK x550%') WHERE id = 115;  -- Lv40 절대 영도
UPDATE skills SET damage_mult = 6.50,  description = REPLACE(description, 'MATK x220%', 'MATK x650%') WHERE id = 131;  -- Lv65 시간 왜곡
UPDATE skills SET damage_mult = 9.00,  description = REPLACE(description, 'MATK x400%', 'MATK x900%') WHERE id = 179;  -- Lv80 절대 영역

SELECT id, name, required_level, description, damage_mult, effect_type FROM skills
WHERE id IN (91, 92, 115, 131, 179) ORDER BY required_level;

COMMIT;
