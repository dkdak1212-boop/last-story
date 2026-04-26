-- 오프라인 정산 floor 변경: 누적 300킬 → 현재 사냥터 20킬
-- 또한 EMA 윈도우 100초 → 300초 (코드 변경과 함께)
SET client_encoding TO 'UTF8';
BEGIN;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS current_field_kills INT NOT NULL DEFAULT 0;

-- 기존 캐릭은 0 부터 시작 — 다음 사냥부터 카운트.
-- 일관성: 사냥터 이동 시 매번 0 리셋되므로 유실되는 데이터는 약간의 카운트뿐.

SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'characters' AND column_name = 'current_field_kills';

COMMIT;
