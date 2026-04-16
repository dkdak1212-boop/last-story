-- 자동판매 품질 상한 설정 (0~100, 이 값 이하 품질만 자동판매)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS auto_sell_quality_max INT NOT NULL DEFAULT 0;
