-- 시공의 균열 입장 시각 영속화 (2026-04-30)
-- 진입 시 30분 타이머 시작, 사망/탭이동/재진입에도 시간은 계속 흐름.
-- 30분 만료 후 다음 진입 시 자동으로 새 타이머.

ALTER TABLE characters ADD COLUMN IF NOT EXISTS rift_entered_at TIMESTAMPTZ;
