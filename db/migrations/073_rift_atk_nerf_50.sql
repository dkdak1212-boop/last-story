-- 시공의 균열 몬스터 공격력 -50% 너프 (id 500~599 전부) — 2026-04-29
-- str (물리 공격 derived) ÷2, matk_based 몬스터는 int 도 ÷2.
-- def/mdef/HP/spd/skills 그대로 유지.

UPDATE monsters
   SET stats = jsonb_set(stats, '{str}', to_jsonb(GREATEST(1, ((stats->>'str')::int / 2))))
 WHERE id BETWEEN 500 AND 599;

UPDATE monsters
   SET stats = jsonb_set(stats, '{int}', to_jsonb(GREATEST(1, ((stats->>'int')::int / 2))))
 WHERE id BETWEEN 500 AND 599
   AND COALESCE((stats->>'matk_based')::boolean, false) = true;
