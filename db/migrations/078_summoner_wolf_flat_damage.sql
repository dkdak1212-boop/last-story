-- 늑대 소환 고정 데미지 500 (Lv.1 무기 미장착 상태에서도 늑대가 의미있는 딜)
-- processSummons 가 (matk × value/100 + flat_damage) × 버프 형태로 가산.
-- 다른 소환 스킬은 flat_damage=0 유지 — matk 스케일링 그대로.
SET client_encoding TO 'UTF8';
BEGIN;
UPDATE skills SET flat_damage = 500 WHERE class_name = 'summoner' AND name = '늑대 소환';
COMMIT;
