-- 시공의 균열 몬스터 공격력/방어력 -50% 너프 (2026-04-29)
-- str (공격력 derived) + def (물리방어) ÷2. mdef/HP/spd 는 유지.
-- 062 마이그(×2 강화) 의 일부를 되돌리는 효과 — 결과적으로 str/def 는 062 적용 전 값.

UPDATE monsters
   SET stats = jsonb_set(
         jsonb_set(
           stats,
           '{str}', to_jsonb(GREATEST(1, ((stats->>'str')::int / 2)))
         ),
         '{def}', to_jsonb(GREATEST(1, ((stats->>'def')::int / 2)))
       )
 WHERE id IN (500, 501, 502);
