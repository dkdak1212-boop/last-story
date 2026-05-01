-- 801/802 무기 base cri 5로 고정
SET client_encoding TO 'UTF8';
BEGIN;

-- 801 무한 망각의 대검: cri 5
UPDATE items SET
  stats = '{"atk":990,"hp":1200,"str":28,"cri":5}'::jsonb
WHERE id = 801;

-- 802 차원 분쇄자: cri 5
UPDATE items SET
  stats = '{"atk":1100,"hp":700,"str":30,"cri":5}'::jsonb
WHERE id = 802;

SELECT id, name, stats, unique_prefix_stats, description
FROM items
WHERE id IN (801, 802)
ORDER BY id;

COMMIT;
