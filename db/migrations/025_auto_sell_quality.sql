-- 자동판매 품질 상한 설정 (0~100, 이 값 이하 품질만 자동판매)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS auto_sell_quality_max INT NOT NULL DEFAULT 0;
-- 드랍 필터 등급 비트마스크 (bit0=common, bit1=rare, bit2=epic) — ON이면 해당 등급 드랍 무시
ALTER TABLE characters ADD COLUMN IF NOT EXISTS drop_filter_grades INT NOT NULL DEFAULT 0;
