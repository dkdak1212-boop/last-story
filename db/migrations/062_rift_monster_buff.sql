-- 시공의 균열 몬스터 강화 (500/501/502) — 2026-04-29
-- spd 800 고정, str/def/mdef ×2, max_hp ×5

UPDATE monsters
   SET max_hp = max_hp * 5,
       stats = jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(
               stats,
               '{spd}', to_jsonb(800)
             ),
             '{str}', to_jsonb(((stats->>'str')::int * 2))
           ),
           '{def}', to_jsonb(((stats->>'def')::int * 2))
         ),
         '{mdef}', to_jsonb(((stats->>'mdef')::int * 2))
       )
 WHERE id IN (500, 501, 502);
