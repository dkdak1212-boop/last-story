-- 시공의 균열 세트 (id=4) 보너스 신규 + prefix-style 키 적용 가능하도록 코드 패치 동반
-- character.ts/engine.ts 에서 setBonus 의 non-Stats 키를 equipPrefixes 에 합류하도록 수정.
-- 2026-04-29

UPDATE item_sets
   SET set_bonus_2 = '{"multi_hit_amp_pct":20, "gauge_on_crit_pct":12}'::jsonb,
       set_bonus_4 = '{"atk_pct":20, "matk_pct":20, "def_pierce_pct":25}'::jsonb,
       set_bonus_6 = '{"max_hp_pct":30, "crit_dmg_pct":60, "predator_pct":30, "damage_taken_down_pct":20}'::jsonb,
       description = '시공의 균열에서 제작된 차원 장비 세트. 모을수록 차원의 힘이 깨어남.'
 WHERE id = 4;
