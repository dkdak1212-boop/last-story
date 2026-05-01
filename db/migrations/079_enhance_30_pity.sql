-- 강화 시스템 v2: 최대 30강 + 파괴 폐지 + +21~+30 누적 보호 (pity)
-- character_inventory / character_equipped 에 enhance_pity 컬럼 추가.
-- pity = +21~+30 강화 실패 누적 카운트. 성공 시 0 으로 리셋.
-- 다음 시도 성공률 = base 1% + pity × 0.1% (cap 100%).
SET client_encoding TO 'UTF8';
BEGIN;

ALTER TABLE character_inventory ADD COLUMN IF NOT EXISTS enhance_pity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE character_equipped  ADD COLUMN IF NOT EXISTS enhance_pity INTEGER NOT NULL DEFAULT 0;

COMMIT;
