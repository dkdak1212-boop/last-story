-- 길드 보스 Phase 2 — 메커닉 지원 컬럼

-- 누적 타격 수 (누적 디버프 계산용, 길드 단위 일일)
ALTER TABLE guild_boss_guild_daily ADD COLUMN IF NOT EXISTS total_hits BIGINT NOT NULL DEFAULT 0;

-- 시계태엽 거인 HP 회복 시점 (lazy 계산용 — 마지막 회복 적용 시각)
ALTER TABLE guild_boss_runs ADD COLUMN IF NOT EXISTS last_recover_at TIMESTAMPTZ;

-- 천공의 용 — 입장 시 할당된 약점 원소
ALTER TABLE guild_boss_runs ADD COLUMN IF NOT EXISTS random_weak_element VARCHAR(20);
