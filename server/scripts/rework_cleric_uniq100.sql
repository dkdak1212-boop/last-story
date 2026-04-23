-- 100제 유니크 성직자 무기 3종 개편 (806/807/808)
-- 스펙: cleric-uniq100-rework-spec.md
SET client_encoding TO 'UTF8';
BEGIN;

-- 806 신성한 차원의 홀: matk 유지, hp 2000, vit 20 / 쉴드효과 +20%, 받는피해 -10%
UPDATE items SET
  stats = '{"matk": 945, "hp": 2000, "vit": 20}'::jsonb,
  unique_prefix_stats = '{"shield_amp": 20, "damage_taken_down_pct": 10}'::jsonb,
  description = '[유니크] 쉴드효과 +20%, 받는 데미지 -10%'
WHERE id = 806;

-- 807 영원한 빛의 성구: vit 50 교체 / 흡혈 제거 + hp_pct→max_hp_pct 버그수정
UPDATE items SET
  stats = '{"matk": 910, "hp": 1300, "vit": 50}'::jsonb,
  unique_prefix_stats = '{"max_hp_pct": 18}'::jsonb,
  description = '[유니크] 최대 HP +18%'
WHERE id = 807;

-- 808 무한의 심판: 기본 스탯 유지 / matk +30%, 받는피해 -20%
UPDATE items SET
  unique_prefix_stats = '{"matk_pct": 30, "damage_taken_down_pct": 20}'::jsonb,
  description = '[유니크] 마법공격 +30%, 받는 데미지 -20%'
WHERE id = 808;

SELECT id, name, stats, unique_prefix_stats, description
FROM items
WHERE id IN (806, 807, 808)
ORDER BY id;

COMMIT;
