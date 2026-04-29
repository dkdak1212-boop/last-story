-- 치명타 게이지 prefix → 현재속도 % 으로 전환 (2026-04-29)
-- gauge_on_crit_pct 키 → spd_pct 키, 수치 -50% (Math.floor), 엔진에서 합산 100% 캡 적용.
-- 적용 범위: item_prefixes / items.unique_prefix_stats / item_sets.set_bonus_*
--          + character_equipped / character_inventory / account_storage_items / auctions / mailbox

-- 1) 접두사 정의 (#85~88) — stat_key 변경 + 값 절반 (floor)
UPDATE item_prefixes
   SET stat_key = 'spd_pct',
       min_val = FLOOR(min_val::numeric / 2)::int,
       max_val = FLOOR(max_val::numeric / 2)::int
 WHERE stat_key = 'gauge_on_crit_pct';

-- 1.5) min_val/max_val 가 0 이 된 케이스 보정 — 최소 1 보장
UPDATE item_prefixes SET min_val = 1 WHERE stat_key = 'spd_pct' AND min_val < 1;
UPDATE item_prefixes SET max_val = GREATEST(min_val, max_val) WHERE stat_key = 'spd_pct';

-- 2) 유니크 아이템 unique_prefix_stats (8종)
UPDATE items
   SET unique_prefix_stats =
     (unique_prefix_stats - 'gauge_on_crit_pct')
     || jsonb_build_object('spd_pct', FLOOR((unique_prefix_stats->>'gauge_on_crit_pct')::numeric / 2)::int)
 WHERE unique_prefix_stats ? 'gauge_on_crit_pct';

-- 3) 세트 보너스 — set_bonus_2/4/6 각각 키 교체 + 값 절반
UPDATE item_sets
   SET set_bonus_2 =
     (set_bonus_2 - 'gauge_on_crit_pct')
     || jsonb_build_object('spd_pct', FLOOR((set_bonus_2->>'gauge_on_crit_pct')::numeric / 2)::int)
 WHERE set_bonus_2 ? 'gauge_on_crit_pct';
UPDATE item_sets
   SET set_bonus_4 =
     (set_bonus_4 - 'gauge_on_crit_pct')
     || jsonb_build_object('spd_pct', FLOOR((set_bonus_4->>'gauge_on_crit_pct')::numeric / 2)::int)
 WHERE set_bonus_4 ? 'gauge_on_crit_pct';
UPDATE item_sets
   SET set_bonus_6 =
     (set_bonus_6 - 'gauge_on_crit_pct')
     || jsonb_build_object('spd_pct', FLOOR((set_bonus_6->>'gauge_on_crit_pct')::numeric / 2)::int)
 WHERE set_bonus_6 ? 'gauge_on_crit_pct';

-- 4) character_equipped — 장착 중인 prefix
UPDATE character_equipped
   SET prefix_stats =
     (prefix_stats - 'gauge_on_crit_pct')
     || jsonb_build_object('spd_pct', FLOOR((prefix_stats->>'gauge_on_crit_pct')::numeric / 2)::int)
 WHERE prefix_stats ? 'gauge_on_crit_pct';

-- 5) character_inventory — 인벤토리 미장착
UPDATE character_inventory
   SET prefix_stats =
     (prefix_stats - 'gauge_on_crit_pct')
     || jsonb_build_object('spd_pct', FLOOR((prefix_stats->>'gauge_on_crit_pct')::numeric / 2)::int)
 WHERE prefix_stats ? 'gauge_on_crit_pct';

-- 6) account_storage_items — 계정 창고
UPDATE account_storage_items
   SET prefix_stats =
     (prefix_stats - 'gauge_on_crit_pct')
     || jsonb_build_object('spd_pct', FLOOR((prefix_stats->>'gauge_on_crit_pct')::numeric / 2)::int)
 WHERE prefix_stats ? 'gauge_on_crit_pct';

-- 7) auctions — 거래소 등록 아이템
UPDATE auctions
   SET prefix_stats =
     (prefix_stats - 'gauge_on_crit_pct')
     || jsonb_build_object('spd_pct', FLOOR((prefix_stats->>'gauge_on_crit_pct')::numeric / 2)::int)
 WHERE prefix_stats ? 'gauge_on_crit_pct';

-- 8) mailbox — 우편함 첨부 아이템
UPDATE mailbox
   SET prefix_stats =
     (prefix_stats - 'gauge_on_crit_pct')
     || jsonb_build_object('spd_pct', FLOOR((mailbox.prefix_stats->>'gauge_on_crit_pct')::numeric / 2)::int)
 WHERE prefix_stats ? 'gauge_on_crit_pct';

-- 9) guild_storage_items — 길드 창고 (현재 0건이지만 안전망)
UPDATE guild_storage_items
   SET prefix_stats =
     (prefix_stats - 'gauge_on_crit_pct')
     || jsonb_build_object('spd_pct', FLOOR((prefix_stats->>'gauge_on_crit_pct')::numeric / 2)::int)
 WHERE prefix_stats ? 'gauge_on_crit_pct';
