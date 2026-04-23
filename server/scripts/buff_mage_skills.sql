-- 마법사 전체 스킬 계수 ×1.15 + 4개 스킬 INT 고정 데미지 툴팁 업데이트
BEGIN;

-- 1) 전 마법사 스킬 damage_mult ×1.15 (소수 2자리 반올림)
UPDATE skills
SET damage_mult = ROUND((damage_mult * 1.15)::numeric, 2)
WHERE class_name = 'mage' AND damage_mult > 0;

-- 2) 툴팁에 INT 스케일링 추가 표기 (엔진에 하드코딩된 SKILL_INT_FLAT 매칭)
UPDATE skills SET description = description || ' (INT 1당 +1000 고정 피해)' WHERE class_name = 'mage' AND name = '운석 폭격' AND description NOT LIKE '%INT 1당%';
UPDATE skills SET description = description || ' (INT 1당 +2000 고정 피해)' WHERE class_name = 'mage' AND name = '별의 종말' AND description NOT LIKE '%INT 1당%';
UPDATE skills SET description = description || ' (INT 1당 +3000 고정 피해)' WHERE class_name = 'mage' AND name = '원소 대폭발' AND description NOT LIKE '%INT 1당%';
UPDATE skills SET description = description || ' (INT 1당 +5000 고정 피해)' WHERE class_name = 'mage' AND name = '창세의 빛' AND description NOT LIKE '%INT 1당%';

-- 확인
SELECT id, name, required_level, damage_mult, flat_damage, description
FROM skills
WHERE class_name = 'mage'
ORDER BY required_level;

COMMIT;
