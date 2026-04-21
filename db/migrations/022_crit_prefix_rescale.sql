-- 치명타 계열 접두사 수치 재조정
-- cri: T4 min 5 → 6 (나머지 그대로)
-- crit_dmg_pct: 변경 없음
-- gauge_on_crit_pct: T2 max 5→6, T3 max 8→10, T4 min 8→12 max 10→16

BEGIN;

-- item_prefixes 갱신
UPDATE item_prefixes SET min_val = 6 WHERE id = 24; -- 사신의 (cri t4)
UPDATE item_prefixes SET max_val = 6 WHERE id = 86; -- 격노의 (gauge t2)
UPDATE item_prefixes SET max_val = 10 WHERE id = 87; -- 재충전의 (gauge t3)
UPDATE item_prefixes SET min_val = 12, max_val = 16 WHERE id = 88; -- 영원의 박동 (gauge t4)

-- 기존 아이템의 gauge_on_crit_pct 재계산 (유니크 고정 + 접두사 신 max)
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
