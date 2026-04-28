-- 110제 시공 분쇄 무기 v2 — 도적 base str 전환 + 신규 유니크 옵션 (4옵 컨셉형)
-- 2026-04-29

-- 900 전사 — 분노의 화신
UPDATE items SET unique_prefix_stats = '{"atk_pct":25,"berserk_pct":30,"predator_pct":20,"def_pierce_pct":20}'::jsonb WHERE id = 900;
-- 901 마법사 — 치명 폭주
UPDATE items SET unique_prefix_stats = '{"matk_pct":25,"crit_dmg_pct":50,"gauge_on_crit_pct":15}'::jsonb WHERE id = 901;
-- 902 성직자 — 수호자 결의
UPDATE items SET unique_prefix_stats = '{"matk_pct":18,"max_hp_pct":25,"predator_pct":20,"thorns_pct":30}'::jsonb WHERE id = 902;
-- 903 도적 — 그림자 무용 + base dex 40 → str 40 전환 (str 1당 atk +0.25% 클래스 패시브 활용)
UPDATE items SET stats = '{"hp":850,"atk":1550,"str":40}'::jsonb,
  unique_prefix_stats = '{"atk_pct":20,"ambush_pct":40,"evasion_burst_pct":50,"dot_amp_pct":35}'::jsonb WHERE id = 903;
-- 904 소환사 — 차원의 군주
UPDATE items SET unique_prefix_stats = '{"matk_pct":18,"summon_amp":30,"summon_max_extra":1,"summon_double_hit":15}'::jsonb WHERE id = 904;
