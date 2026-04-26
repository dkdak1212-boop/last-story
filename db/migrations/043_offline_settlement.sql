-- 오프라인 보상 EMA 정산 시스템 (Step 1: DB 컬럼 추가)
-- 관련 spec: last-story-offline-rewards-redesign-spec.md
-- 안전: 컬럼 추가만, 모두 NULL/0 허용. 코드 미변경 시 영향 없음.
SET client_encoding TO 'UTF8';
BEGIN;

-- 1) 드랍 EMA — flushCharBatch 가 갱신할 새 컬럼
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS online_drop_rate NUMERIC NOT NULL DEFAULT 0;

-- 2) 오프라인 진입 시각 — onSessionGoOffline 가 NOW() 기록
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS last_offline_at TIMESTAMPTZ;

-- 3) 마지막 정산 시각 — 멱등 마킹용
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS last_offline_settled_at TIMESTAMPTZ;

-- 4) 오프라인 진입 시점의 필드 — 드랍 추첨 풀 결정
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS last_field_id_offline INTEGER;

-- 검증
SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'characters'
   AND column_name IN ('online_drop_rate','last_offline_at','last_offline_settled_at','last_field_id_offline')
 ORDER BY column_name;

COMMIT;
