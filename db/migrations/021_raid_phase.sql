-- 레이드 페이즈 시스템
ALTER TABLE world_event_active ADD COLUMN IF NOT EXISTS current_phase INT DEFAULT 1;
ALTER TABLE world_event_active ADD COLUMN IF NOT EXISTS phase_pattern TEXT DEFAULT 'normal';
ALTER TABLE world_event_active ADD COLUMN IF NOT EXISTS phase_changed_at TIMESTAMPTZ DEFAULT NOW();

-- 시간 제한 1시간으로 변경
UPDATE world_event_bosses SET time_limit_sec = 3600;
