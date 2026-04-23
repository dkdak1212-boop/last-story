-- 100제 유니크 무기 8종 리메이크 (전사 2 · 마법사 3 · 소환사 3)
-- 스펙: uniq100-weapons-rework-spec.md
-- 800 시공의 절단검, 성직자(806-808 최근 개편), 도적(809-811) 제외
SET client_encoding TO 'UTF8';
BEGIN;

-- 전사 801 무한 망각의 대검
UPDATE items SET
  stats = '{"atk":990,"hp":1200,"str":28,"cri":8}'::jsonb,
  unique_prefix_stats = '{"atk_pct":12,"crit_dmg_pct":15}'::jsonb,
  description = '[유니크] 공격 +12%, 치명타 피해 +15%'
WHERE id = 801;

-- 전사 802 차원 분쇄자
UPDATE items SET
  stats = '{"atk":1100,"hp":700,"cri":12,"str":30}'::jsonb,
  unique_prefix_stats = '{"atk_pct":10,"crit_dmg_pct":22,"def_reduce_pct":15}'::jsonb,
  description = '[유니크] 공격 +10%, 치명타 피해 +22%, 적 방어 -15%'
WHERE id = 802;

-- 마법사 803 시간의 종말
UPDATE items SET
  stats = '{"matk":1080,"int":30,"hp":700}'::jsonb,
  unique_prefix_stats = '{"matk_pct":11,"crit_dmg_pct":15,"gauge_on_crit_pct":7}'::jsonb,
  description = '[유니크] 마법공격 +11%, 치명타 피해 +15%, 치명타 시 게이지 +7%'
WHERE id = 803;

-- 마법사 804 무한 별의 지팡이
UPDATE items SET
  stats = '{"matk":1050,"int":28,"hp":800}'::jsonb,
  unique_prefix_stats = '{"matk_pct":15,"crit_dmg_pct":13}'::jsonb,
  description = '[유니크] 마법공격 +15%, 치명타 피해 +13%'
WHERE id = 804;

-- 마법사 805 차원 균열의 홀
UPDATE items SET
  stats = '{"matk":1100,"int":26,"hp":700}'::jsonb,
  unique_prefix_stats = '{"matk_pct":10,"crit_dmg_pct":17,"def_pierce_pct":10}'::jsonb,
  description = '[유니크] 마법공격 +10%, 치명타 피해 +17%, 적 방어 +10% 추가 무시'
WHERE id = 805;

-- 소환사 812 무한 소환의 보주
UPDATE items SET
  stats = '{"matk":1050,"int":28,"hp":950}'::jsonb,
  unique_prefix_stats = '{"matk_pct":10,"summon_amp":20,"summon_double_hit":12}'::jsonb,
  description = '[유니크] 마법공격 +10%, 소환수 데미지 +20%, 소환수 2회 타격 +12%'
WHERE id = 812;

-- 소환사 813 차원 균열의 토템
UPDATE items SET
  stats = '{"matk":1000,"int":26,"hp":1100,"spd":50}'::jsonb,
  unique_prefix_stats = '{"matk_pct":9,"summon_max_extra":1}'::jsonb,
  description = '[유니크] 마법공격 +9%, 최대 소환수 +1'
WHERE id = 813;

-- 소환사 814 시공 소환술서
UPDATE items SET
  stats = '{"matk":1070,"int":30,"hp":800,"spd":50}'::jsonb,
  unique_prefix_stats = '{"matk_pct":12,"summon_amp":15}'::jsonb,
  description = '[유니크] 마법공격 +12%, 소환수 데미지 +15%'
WHERE id = 814;

SELECT id, name, stats, unique_prefix_stats, description
FROM items
WHERE id IN (801, 802, 803, 804, 805, 812, 813, 814)
ORDER BY id;

COMMIT;
