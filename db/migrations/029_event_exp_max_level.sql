-- 신규 캐릭터 이벤트 EXP 버프(event_exp_pct/until)에 레벨 상한 추가
-- 캐릭터 레벨이 event_exp_max_level 에 도달하면 시간 만료와 무관하게 버프 무효
SET client_encoding TO 'UTF8';
BEGIN;

ALTER TABLE characters ADD COLUMN IF NOT EXISTS event_exp_max_level INTEGER;

-- 기존 활성 신규유저 버프 보유자 → Lv.95 상한 부여
UPDATE characters
   SET event_exp_max_level = 95
 WHERE event_exp_pct IS NOT NULL
   AND event_exp_pct > 0
   AND event_exp_until IS NOT NULL
   AND event_exp_until > NOW()
   AND event_exp_max_level IS NULL;

SELECT COUNT(*)::int AS upgraded
  FROM characters
 WHERE event_exp_max_level = 95;

COMMIT;
