-- 종언의 첨병 (id=507) def 너프 — 50,000 → 40,000
-- 사유: 다른 일반 몬스터 def 30K~35K 대비 +15% 수준으로 조정 (이전 +43%).
-- dr_pct 35% / mdef 24K / HP 9억 (다른 일반 ×1.5) 은 그대로 — "탱커형" 차별화 유지.
-- 2026-04-27

UPDATE monsters
   SET stats = jsonb_set(stats, '{def}', to_jsonb(40000))
 WHERE id = 507;
