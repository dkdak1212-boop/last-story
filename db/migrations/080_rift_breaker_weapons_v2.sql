-- 시공 분쇄 무기 5종 (id 900~904) stats + unique_prefix_stats 개편
-- 베이스 스탯: 모두 hp 5000, 주력 stat 100 (str/int/vit)
-- 신규 옵션 키: full_hp_amp_pct (풀피 시 데미지 +N%)
SET client_encoding TO 'UTF8';
BEGIN;

-- 900 시공 분쇄 대검 (전사) — atk 1650/str 100/hp 5000
UPDATE items
   SET stats = '{"hp": 5000, "atk": 1650, "str": 100}'::jsonb,
       unique_prefix_stats = '{"atk_pct": 25, "full_hp_amp_pct": 30, "predator_pct": 20, "spd_pct": 14}'::jsonb
 WHERE id = 900;

-- 901 시공 분쇄 지팡이 (마법사) — matk 1650/int 100/hp 5000
UPDATE items
   SET stats = '{"hp": 5000, "matk": 1650, "int": 100}'::jsonb,
       unique_prefix_stats = '{"matk_pct": 25, "crit_dmg_pct": 50, "spd_pct": 25}'::jsonb
 WHERE id = 901;

-- 902 시공 분쇄 홀 (성직자) — matk 1500/vit 200/hp 5000 (int 제거)
UPDATE items
   SET stats = '{"hp": 5000, "matk": 1500, "vit": 200}'::jsonb,
       unique_prefix_stats = '{"max_hp_pct": 25, "thorns_pct": 30, "berserk_pct": 30, "spd_pct": 14}'::jsonb
 WHERE id = 902;

-- 903 시공 분쇄 단검 (도적) — atk 1550/str 100/hp 5000
UPDATE items
   SET stats = '{"hp": 5000, "atk": 1550, "str": 100}'::jsonb,
       unique_prefix_stats = '{"atk_pct": 20, "dot_amp_pct": 35, "evasion_burst_pct": 50, "spd_pct": 14}'::jsonb
 WHERE id = 903;

-- 904 시공 분쇄 보주 (소환사) — matk 1600/int 100/hp 5000
UPDATE items
   SET stats = '{"hp": 5000, "matk": 1600, "int": 100}'::jsonb,
       unique_prefix_stats = '{"matk_pct": 18, "summon_max_extra": 1, "summon_double_hit": 15, "spd_pct": 14}'::jsonb
 WHERE id = 904;

COMMIT;
