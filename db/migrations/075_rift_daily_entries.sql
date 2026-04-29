-- 시공의 균열 일일 입장 횟수 제한 (2026-04-30)
-- 하루 2회 제한 — 새 30분 타이머가 시작될 때마다 카운트 +1.
-- 같은 타이머 내 재진입(사망/탭이동)은 카운트 안 됨.

ALTER TABLE characters ADD COLUMN IF NOT EXISTS rift_daily_count INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS rift_daily_date DATE;
