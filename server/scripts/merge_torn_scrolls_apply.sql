SET client_encoding TO 'UTF8';
BEGIN;

-- 1. 캐릭터별 합계 + 최저 id 계산
CREATE TEMP TABLE merge_plan AS
SELECT character_id,
       MIN(id) AS keep_id,
       SUM(quantity)::int AS total_qty
FROM character_inventory
WHERE item_id = 320
GROUP BY character_id
HAVING COUNT(*) > 1;

\echo '=== 합칠 캐릭터 수 ==='
SELECT COUNT(*) FROM merge_plan;

-- 2. 유지할 row의 quantity를 합계로 업데이트
UPDATE character_inventory ci
SET quantity = mp.total_qty
FROM merge_plan mp
WHERE ci.id = mp.keep_id;

-- 3. 나머지 row 삭제
DELETE FROM character_inventory ci
USING merge_plan mp
WHERE ci.character_id = mp.character_id
  AND ci.item_id = 320
  AND ci.id <> mp.keep_id;

-- 4. 결과 검증
\echo ''
\echo '=== 합치기 후 통계 ==='
SELECT COUNT(*) AS total_rows,
       COUNT(DISTINCT character_id) AS chars,
       SUM(quantity) AS total_qty
FROM character_inventory WHERE item_id = 320;

\echo ''
\echo '=== 한 캐릭당 row 수 분포 (1보다 큰 게 있나) ==='
SELECT character_id, COUNT(*) AS rows
FROM character_inventory WHERE item_id = 320
GROUP BY character_id HAVING COUNT(*) > 1;

COMMIT;
