-- hp_pct (코드에 없는 키, 실효 0%) → max_hp_pct (실제 적용되는 키) 일괄 리네이밍
-- 대상: 100제 유니크 8종 (801/813/815/819/822/829/832/838)
-- 값·툴팁 유지, 키 이름만 교체
SET client_encoding TO 'UTF8';
BEGIN;

UPDATE items
SET unique_prefix_stats =
    (unique_prefix_stats - 'hp_pct')
    || jsonb_build_object('max_hp_pct', (unique_prefix_stats->>'hp_pct')::int)
WHERE unique_prefix_stats ? 'hp_pct';

-- 확인
SELECT id, name, unique_prefix_stats
FROM items
WHERE id IN (801, 813, 815, 819, 822, 829, 832, 838)
ORDER BY id;

-- hp_pct 잔여 체크 (0이어야 정상)
SELECT COUNT(*) AS remaining_hp_pct_count
FROM items
WHERE unique_prefix_stats ? 'hp_pct';

COMMIT;
