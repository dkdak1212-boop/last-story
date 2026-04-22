-- 이벤트 버프 시스템 — 기존 +50% 부스터와 독립된 별도 버프 트랙
-- event_exp_pct / event_drop_pct : 추가 % (예: 300 = +300%, ×4.0 곱셈)
-- 기존 exp_boost_until (×1.5) 과 곱산되어 동시 활성 시 모두 적용됨.
-- 2026-04-22

BEGIN;

ALTER TABLE characters ADD COLUMN IF NOT EXISTS event_exp_pct   INT         NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS event_exp_until TIMESTAMPTZ;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS event_drop_pct  INT         NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS event_drop_until TIMESTAMPTZ;

-- 24시간 이벤트 버프 지급: EXP +300%, DROP +200%
-- 대상: 분노 · 일단 · 이단 · 둥둥 · 마법 · 똘똘한박서연 · 나혼자레벨업 · 아우라
UPDATE characters
SET event_exp_pct   = 300,
    event_exp_until = NOW() + INTERVAL '24 hours',
    event_drop_pct  = 200,
    event_drop_until = NOW() + INTERVAL '24 hours'
WHERE name IN ('분노','일단','이단','둥둥','마법','똘똘한박서연','나혼자레벨업','아우라');

-- 확인
SELECT id, name, event_exp_pct, event_exp_until, event_drop_pct, event_drop_until
FROM characters
WHERE name IN ('분노','일단','이단','둥둥','마법','똘똘한박서연','나혼자레벨업','아우라')
ORDER BY name;

COMMIT;
