-- 자동판매 품질 상한 설정 (0~100, 이 값 이하 품질만 자동판매)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS auto_sell_quality_max INT NOT NULL DEFAULT 0;
-- 드랍 필터 (줍지 않을 조건)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS drop_filter_grades INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS drop_filter_tiers INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS drop_filter_quality_max INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS drop_filter_common BOOLEAN NOT NULL DEFAULT FALSE;
-- 접두사 보호 (자동판매/드랍필터에서 해당 접두사가 있으면 보호)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS auto_sell_protect_prefixes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE characters ADD COLUMN IF NOT EXISTS drop_filter_protect_prefixes TEXT[] NOT NULL DEFAULT '{}';
