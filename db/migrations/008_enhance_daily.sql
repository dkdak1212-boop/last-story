-- v0.7: 장비 강화 + 출석 보상
BEGIN;

-- 장비 강화 레벨
ALTER TABLE character_inventory ADD COLUMN IF NOT EXISTS enhance_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE character_equipped ADD COLUMN IF NOT EXISTS enhance_level INTEGER NOT NULL DEFAULT 0;

-- 출석 체크 기록
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_check_in DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS consecutive_days INTEGER NOT NULL DEFAULT 0;

COMMIT;
