-- Lv.100 유니크 각반 4종 제거 (아직 출시 전 항목 정리)
-- 대상 id: 823~826
--   823 무한 도약의 각반 · 824 시공 보행의 각반 · 825 차원 균열의 각반 · 826 영원의 무릎보호대
-- 소유자 0명 (character_equipped / inventory / storage / mailbox / auctions 전부 0)
-- 2026-04-22

BEGIN;

-- 1) 몬스터 drop_table 에서 823~826 참조 제거 (orphan 방지)
UPDATE monsters
SET drop_table = (
  SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
  FROM jsonb_array_elements(drop_table) e
  WHERE NOT ((e->>'itemId')::int BETWEEN 823 AND 826)
)
WHERE jsonb_typeof(drop_table) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(drop_table) e
    WHERE (e->>'itemId')::int BETWEEN 823 AND 826
  );

-- 2) items 삭제
DELETE FROM items WHERE id BETWEEN 823 AND 826;

-- 확인
SELECT 'items remaining' AS label, COUNT(*) AS n FROM items WHERE id BETWEEN 823 AND 826
UNION ALL
SELECT 'monsters with leg refs',
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(drop_table) e
         WHERE (e->>'itemId')::int BETWEEN 823 AND 826
       ))
FROM monsters WHERE jsonb_typeof(drop_table) = 'array';

COMMIT;
