-- 치명타 게이지 접두사 전체 -25% 너프
-- min/max 모두 × 0.75 반올림 후, 기존 아이템도 재계산
-- T1 충격의 2~3 → 2~2  (max round(3*0.75)=2)
-- T2 격노의 3~6 → 2~5
-- T3 재충전의 6~10 → 5~8
-- T4 영원의 박동 12~16 → 9~12

BEGIN;

UPDATE item_prefixes SET min_val = 2, max_val = 2 WHERE id = 85; -- 충격의 t1
UPDATE item_prefixes SET min_val = 2, max_val = 5 WHERE id = 86; -- 격노의 t2
UPDATE item_prefixes SET min_val = 5, max_val = 8 WHERE id = 87; -- 재충전의 t3
UPDATE item_prefixes SET min_val = 9, max_val = 12 WHERE id = 88; -- 영원의 박동 t4

-- 유니크 고정분 + 신 접두사 max 로 재계산
CREATE OR REPLACE FUNCTION rebuild_gauge_on_crit(
  in_item_id int,
  in_prefix_ids int[]
) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  fixed_v int;
  prefix_v int;
BEGIN
  SELECT COALESCE((unique_prefix_stats->>'gauge_on_crit_pct')::int, 0) INTO fixed_v
    FROM items WHERE id = in_item_id;
  SELECT COALESCE(SUM(ip.max_val), 0) INTO prefix_v
    FROM item_prefixes ip
   WHERE ip.id = ANY(COALESCE(in_prefix_ids, ARRAY[]::int[]))
     AND ip.stat_key = 'gauge_on_crit_pct';
  RETURN COALESCE(fixed_v, 0) + COALESCE(prefix_v, 0);
END;
$$;

UPDATE character_inventory SET prefix_stats = jsonb_set(prefix_stats, '{gauge_on_crit_pct}',
  to_jsonb(rebuild_gauge_on_crit(item_id, prefix_ids)), true) WHERE prefix_stats ? 'gauge_on_crit_pct';
UPDATE character_equipped SET prefix_stats = jsonb_set(prefix_stats, '{gauge_on_crit_pct}',
  to_jsonb(rebuild_gauge_on_crit(item_id, prefix_ids)), true) WHERE prefix_stats ? 'gauge_on_crit_pct';
UPDATE mailbox SET prefix_stats = jsonb_set(prefix_stats, '{gauge_on_crit_pct}',
  to_jsonb(rebuild_gauge_on_crit(item_id, prefix_ids)), true) WHERE prefix_stats ? 'gauge_on_crit_pct';
UPDATE auctions SET prefix_stats = jsonb_set(prefix_stats, '{gauge_on_crit_pct}',
  to_jsonb(rebuild_gauge_on_crit(item_id, prefix_ids)), true) WHERE prefix_stats ? 'gauge_on_crit_pct';
UPDATE account_storage_items SET prefix_stats = jsonb_set(prefix_stats, '{gauge_on_crit_pct}',
  to_jsonb(rebuild_gauge_on_crit(item_id, prefix_ids)), true) WHERE prefix_stats ? 'gauge_on_crit_pct';
UPDATE guild_storage_items SET prefix_stats = jsonb_set(prefix_stats, '{gauge_on_crit_pct}',
  to_jsonb(rebuild_gauge_on_crit(item_id, prefix_ids)), true) WHERE prefix_stats ? 'gauge_on_crit_pct';

DROP FUNCTION rebuild_gauge_on_crit(int, int[]);

COMMIT;
