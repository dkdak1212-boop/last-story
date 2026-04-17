-- 길드 보스 보상 — 공격력/HP 부스터 지원 컬럼
ALTER TABLE characters ADD COLUMN IF NOT EXISTS atk_boost_until TIMESTAMPTZ;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS hp_boost_until TIMESTAMPTZ;
