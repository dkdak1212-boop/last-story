-- 종언의 기둥 — 층 시작 시각 영속화 (2026-04-30)
-- WS 끊김 후 재진입 시 시간 제한 60초가 새로 시작되던 어뷰즈 차단.
-- pauseProgress 시 floor_started_at 그대로 유지 → 재진입 시 남은 시간만 사용.

ALTER TABLE endless_pillar_progress ADD COLUMN IF NOT EXISTS floor_started_at TIMESTAMPTZ;
