-- Lv.100 유니크 드랍률 하향 (0.0025% → 0.000352%, v4 공식 복원)
-- 대상: item_id 800~838 (39종), 드롭 몬스터: 무한의 화신(115 혹은 116), 시간의 군주
-- 공식: base 0.0036 / 2^10 = 0.000003515625 (= 0.000352%)

UPDATE monsters
   SET drop_table = (
     SELECT jsonb_agg(
       CASE
         WHEN (elem->>'itemId')::int BETWEEN 800 AND 838
           THEN elem - 'chance' || jsonb_build_object('chance', 0.000003515625)
         ELSE elem
       END
     )
     FROM jsonb_array_elements(drop_table) elem
   )
 WHERE drop_table @> '[{"itemId": 800}]'
    OR drop_table @> '[{"itemId": 838}]';
