-- v0.2.1: 포션 자동사용 설정
BEGIN;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS potion_settings JSONB NOT NULL DEFAULT
    '{"hpEnabled":true,"hpThreshold":40,"mpEnabled":true,"mpThreshold":30}'::jsonb;

COMMIT;
