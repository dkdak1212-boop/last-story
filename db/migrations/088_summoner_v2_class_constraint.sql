-- 088: characters.class_name CHECK 제약에 'summoner_v2' 추가
-- 015 마이그 이후 archer 추가가 수동 ALTER 로만 적용되어 라이브와 마이그가 어긋남.
-- 이번 마이그는 idempotent 하게 6개 직업 모두 허용으로 재정의.

BEGIN;

ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_class_name_check;
ALTER TABLE characters ADD CONSTRAINT characters_class_name_check
  CHECK (class_name IN ('warrior', 'mage', 'cleric', 'rogue', 'summoner', 'archer', 'summoner_v2'));

COMMIT;
