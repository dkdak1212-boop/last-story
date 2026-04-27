-- 종언의 기둥 — 보스 10종 (508~517) 너프
-- HP / str / int / def / mdef / vit 모두 ÷4 (dex / spd / cri / dr_pct 유지)
-- 사유: 100층 보스 4.8B HP × 3.475 mult = 16.68B → 너무 강해 클리어 어려움
-- 너프 후: 1.2B HP × 3.475 = 4.17B (현 시공균열 균열의 군주 6B 기준 약 70% 수준)
-- 2026-04-27

UPDATE monsters
   SET max_hp = max_hp / 4,
       stats = jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(
                 stats,
                 '{str}',  to_jsonb(GREATEST(1, (stats->>'str')::int / 4))
               ),
               '{int}',  to_jsonb(GREATEST(1, COALESCE((stats->>'int')::int, 0) / 4))
             ),
             '{def}',  to_jsonb(GREATEST(1, COALESCE((stats->>'def')::int, 0) / 4))
           ),
           '{mdef}', to_jsonb(GREATEST(1, COALESCE((stats->>'mdef')::int, 0) / 4))
         ),
         '{vit}',  to_jsonb(GREATEST(1, COALESCE((stats->>'vit')::int, 0) / 4))
       )
 WHERE id BETWEEN 508 AND 517;
