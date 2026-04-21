-- 019 마이그레이션 버그 수정: 유니크 아이템의 gauge_on_crit_pct 고정분이 접두사 max로 덮였음.
-- 올바른 값 = unique_prefix_stats 의 gauge_on_crit_pct + prefix_ids 중 gauge_on_crit_pct 계열 접두사의 max_val 합.

BEGIN;

CREATE OR REPLACE FUNCTION rebuild_gauge_on_crit(
  in_item_id int,
  in_prefix_ids int[]
) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  fixed_v int;
  prefix_v int;
BEGIN
  SELECT COALESCE((unique_prefix_stats->>'gauge_on_crit_pct')::int, 0)
    INTO fixed_v
    FROM items WHERE id = in_item_id;
  SELECT COALESCE(SUM(ip.max_val), 0) INTO prefix_v
    FROM item_prefixes ip
   WHERE ip.id = ANY(COALESCE(in_prefix_ids, ARRAY[]::int[]))
     AND ip.stat_key = 'gauge_on_crit_pct';
  RETURN COALESCE(fixed_v, 0) + COALESCE(prefix_v, 0);
END;
$$;

-- 6개 테이블 모두 재계산
UPDATE character_inventory
   SET prefix_stats = jsonb_set(prefix_stats, '{gauge_on_crit_pct}',
                                to_jsonb(rebuild_gauge_on_crit(item_id, prefix_ids)), true)
 WHERE prefix_stats ? 'gauge_on_crit_pct';

UPDATE character_equipped
   SET prefix_stats = jsonb_set(prefix_stats, '{gauge_on_crit_pct}',
                                to_jsonb(rebuild_gauge_on_crit(item_id, prefix_ids)), true)
 WHERE prefix_stats ? 'gauge_on_crit_pct';

UPDATE mailbox
   SET prefix_stats = jsonb_set(prefix_stats, '{gauge_on_crit_pct}',
                                to_jsonb(rebuild_gauge_on_crit(item_id, prefix_ids)), true)
 WHERE prefix_stats ? 'gauge_on_crit_pct';

UPDATE auctions
   SET prefix_stats = jsonb_set(prefix_stats, '{gauge_on_crit_pct}',
                                to_jsonb(rebuild_gauge_on_crit(item_id, prefix_ids)), true)
 WHERE prefix_stats ? 'gauge_on_crit_pct';

UPDATE account_storage_items
   SET prefix_stats = jsonb_set(prefix_stats, '{gauge_on_crit_pct}',
                                to_jsonb(rebuild_gauge_on_crit(item_id, prefix_ids)), true)
 WHERE prefix_stats ? 'gauge_on_crit_pct';

UPDATE guild_storage_items
   SET prefix_stats = jsonb_set(prefix_stats, '{gauge_on_crit_pct}',
                                to_jsonb(rebuild_gauge_on_crit(item_id, prefix_ids)), true)
 WHERE prefix_stats ? 'gauge_on_crit_pct';

DROP FUNCTION rebuild_gauge_on_crit(int, int[]);

COMMIT;
