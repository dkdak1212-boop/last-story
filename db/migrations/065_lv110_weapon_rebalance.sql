-- 110제 시공 분쇄 무기 (900~904) 재밸런스 (2026-04-29)
-- base atk/matk: 100제 max 의 1.5배로 토닝 (이전 ~2.4배 → 1.5배)
-- unique_prefix_stats: 모두 신규 옵션 조합 (기존 엔진 키 재사용, 신규 코드 X)

UPDATE items SET stats = '{"hp":900,"atk":1650,"str":35}'::jsonb,
  unique_prefix_stats = '{"atk_pct":20,"multi_hit_amp_pct":15,"berserk_pct":25}'::jsonb
 WHERE id = 900;
UPDATE items SET stats = '{"hp":900,"int":35,"matk":1650}'::jsonb,
  unique_prefix_stats = '{"matk_pct":20,"crit_dmg_pct":30,"gauge_on_crit_pct":10}'::jsonb
 WHERE id = 901;
UPDATE items SET stats = '{"hp":1200,"int":30,"vit":10,"matk":1500}'::jsonb,
  unique_prefix_stats = '{"matk_pct":15,"max_hp_pct":20,"damage_taken_down_pct":12}'::jsonb
 WHERE id = 902;
UPDATE items SET stats = '{"hp":850,"atk":1550,"dex":40}'::jsonb,
  unique_prefix_stats = '{"atk_pct":15,"dot_amp_pct":50,"ambush_pct":35}'::jsonb
 WHERE id = 903;
UPDATE items SET stats = '{"hp":900,"int":40,"matk":1600}'::jsonb,
  unique_prefix_stats = '{"matk_pct":15,"summon_amp":25,"summon_double_hit":20}'::jsonb
 WHERE id = 904;
