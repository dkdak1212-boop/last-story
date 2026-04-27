-- 종언의 기둥 — 주간 보상 + 직업별 보상 지원
-- 2026-04-27
--
-- 변경:
-- 1) reward_mapping 에 class_name 컬럼 추가 (NULL = 모든 클래스 공용)
-- 2) 주간 cron 으로 변경 — sendWeeklyRewardMails (KST 월요일 00:00 발동, 5 클래스 각 1~100위)
-- 3) 죽음 시 -10층 (1층 회귀 X) — 코드 변경 (recordDeath)

ALTER TABLE endless_pillar_reward_mapping
  ADD COLUMN IF NOT EXISTS class_name TEXT;

CREATE INDEX IF NOT EXISTS idx_eprm_class ON endless_pillar_reward_mapping(class_name);

-- 기존 시드는 class_name=NULL (전 클래스 공용) 유지.
-- 운영자가 직업별로 달리 주고 싶으면 추가 row 를 INSERT (class_name='warrior' 등).
