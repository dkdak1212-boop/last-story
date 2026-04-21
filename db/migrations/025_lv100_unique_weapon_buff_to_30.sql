-- 유니크 Lv.100 무기 상향 폭을 +250% → +30% 로 조정.
-- 현재 값은 x3.5 상태이므로 × (1.3 / 3.5) 로 재계산 = 원본 기준 +30%.
BEGIN;

UPDATE items
   SET stats = jsonb_set(
                 jsonb_set(
                   stats,
                   '{atk}',
                   to_jsonb( ROUND( COALESCE((stats->>'atk')::numeric, 0) * 1.3 / 3.5 )::int ),
                   false
                 ),
                 '{matk}',
                 to_jsonb( ROUND( COALESCE((stats->>'matk')::numeric, 0) * 1.3 / 3.5 )::int ),
                 false
               )
 WHERE grade = 'unique'
   AND slot = 'weapon'
   AND required_level = 100;

SELECT id, name,
       COALESCE((stats->>'atk')::int, 0) AS atk,
       COALESCE((stats->>'matk')::int, 0) AS matk
  FROM items
 WHERE grade = 'unique' AND slot = 'weapon' AND required_level = 100
 ORDER BY id;

COMMIT;
