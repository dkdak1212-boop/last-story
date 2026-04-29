-- spd_pct 수치 -50% 너프 복구 (×2 복원, 100% 캡 유지) — 2026-04-29
-- 071 에서 floor(N/2) 적용된 값을 다시 ×2 (이전과 동일 수치 복귀, 단 cap 100)

UPDATE item_prefixes
   SET min_val = LEAST(100, min_val * 2),
       max_val = LEAST(100, max_val * 2)
 WHERE stat_key = 'spd_pct';

UPDATE items
   SET unique_prefix_stats =
     unique_prefix_stats || jsonb_build_object('spd_pct', LEAST(100, (unique_prefix_stats->>'spd_pct')::int * 2))
 WHERE unique_prefix_stats ? 'spd_pct';

UPDATE item_sets
   SET set_bonus_2 = set_bonus_2 || jsonb_build_object('spd_pct', LEAST(100, (set_bonus_2->>'spd_pct')::int * 2))
 WHERE set_bonus_2 ? 'spd_pct';
UPDATE item_sets
   SET set_bonus_4 = set_bonus_4 || jsonb_build_object('spd_pct', LEAST(100, (set_bonus_4->>'spd_pct')::int * 2))
 WHERE set_bonus_4 ? 'spd_pct';
UPDATE item_sets
   SET set_bonus_6 = set_bonus_6 || jsonb_build_object('spd_pct', LEAST(100, (set_bonus_6->>'spd_pct')::int * 2))
 WHERE set_bonus_6 ? 'spd_pct';

UPDATE character_equipped
   SET prefix_stats = prefix_stats || jsonb_build_object('spd_pct', LEAST(100, (prefix_stats->>'spd_pct')::int * 2))
 WHERE prefix_stats ? 'spd_pct';

UPDATE character_inventory
   SET prefix_stats = prefix_stats || jsonb_build_object('spd_pct', LEAST(100, (prefix_stats->>'spd_pct')::int * 2))
 WHERE prefix_stats ? 'spd_pct';

UPDATE account_storage_items
   SET prefix_stats = prefix_stats || jsonb_build_object('spd_pct', LEAST(100, (prefix_stats->>'spd_pct')::int * 2))
 WHERE prefix_stats ? 'spd_pct';

UPDATE auctions
   SET prefix_stats = prefix_stats || jsonb_build_object('spd_pct', LEAST(100, (prefix_stats->>'spd_pct')::int * 2))
 WHERE prefix_stats ? 'spd_pct';

UPDATE mailbox
   SET prefix_stats = prefix_stats || jsonb_build_object('spd_pct', LEAST(100, (mailbox.prefix_stats->>'spd_pct')::int * 2))
 WHERE prefix_stats ? 'spd_pct';

UPDATE guild_storage_items
   SET prefix_stats = prefix_stats || jsonb_build_object('spd_pct', LEAST(100, (prefix_stats->>'spd_pct')::int * 2))
 WHERE prefix_stats ? 'spd_pct';
