-- Lv.100 유니크 무기 atk/matk 3.5배 상향 (common 신화 680 기준 이상으로 끌어올림)
BEGIN;

UPDATE items
   SET stats = jsonb_set(
                 jsonb_set(
                   stats,
                   '{atk}',
                   to_jsonb( ROUND( COALESCE((stats->>'atk')::numeric, 0) * 3.5 )::int ),
                   false
                 ),
                 '{matk}',
                 to_jsonb( ROUND( COALESCE((stats->>'matk')::numeric, 0) * 3.5 )::int ),
                 false
               )
 WHERE grade = 'unique'
   AND slot = 'weapon'
   AND required_level = 100;

-- 결과 확인용
SELECT id, name,
       COALESCE((stats->>'atk')::int, 0) AS atk,
       COALESCE((stats->>'matk')::int, 0) AS matk
  FROM items
 WHERE grade = 'unique' AND slot = 'weapon' AND required_level = 100
 ORDER BY id;

COMMIT;
