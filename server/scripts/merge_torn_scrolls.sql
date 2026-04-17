SET client_encoding TO 'UTF8';

-- 사전 점검
\echo '=== 찢어진 스크롤 (id=320) 정보 ==='
SELECT id, name, stack_size, type FROM items WHERE id = 320;

\echo ''
\echo '=== 합치기 전 통계 ==='
SELECT COUNT(*) AS total_rows,
       COUNT(DISTINCT character_id) AS chars,
       SUM(quantity) AS total_qty
FROM character_inventory WHERE item_id = 320;

\echo ''
\echo '=== 1캐릭당 row 수 분포 (상위 10) ==='
SELECT character_id, COUNT(*) AS rows, SUM(quantity) AS total
FROM character_inventory WHERE item_id = 320
GROUP BY character_id ORDER BY rows DESC LIMIT 10;
