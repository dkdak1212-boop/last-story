-- 019 버그 수정 2차: cri / crit_dmg_pct 도 gauge_on_crit_pct 와 동일하게
-- 유니크 고정 스탯이 접두사 max 로 덮인 케이스 복원.
-- 올바른 값 = unique_prefix_stats 고정분 + prefix_ids 중 해당 stat_key 접두사의 max_val 합.

BEGIN;

CREATE OR REPLACE FUNCTION rebuild_crit_stat(
  in_item_id int,
  in_prefix_ids int[],
  in_stat_key text
) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  fixed_v int;
  prefix_v int;
BEGIN
  SELECT COALESCE((unique_prefix_stats->>in_stat_key)::int, 0)
    INTO fixed_v FROM items WHERE id = in_item_id;
  SELECT COALESCE(SUM(ip.max_val), 0) INTO prefix_v
    FROM item_prefixes ip
   WHERE ip.id = ANY(COALESCE(in_prefix_ids, ARRAY[]::int[]))
     AND ip.stat_key = in_stat_key;
  RETURN COALESCE(fixed_v, 0) + COALESCE(prefix_v, 0);
END;
$$;

-- cri
UPDATE character_inventory SET prefix_stats = jsonb_set(prefix_stats, '{cri}',
  to_jsonb(rebuild_crit_stat(item_id, prefix_ids, 'cri')), true) WHERE prefix_stats ? 'cri';
UPDATE character_equipped SET prefix_stats = jsonb_set(prefix_stats, '{cri}',
  to_jsonb(rebuild_crit_stat(item_id, prefix_ids, 'cri')), true) WHERE prefix_stats ? 'cri';
UPDATE mailbox SET prefix_stats = jsonb_set(prefix_stats, '{cri}',
  to_jsonb(rebuild_crit_stat(item_id, prefix_ids, 'cri')), true) WHERE prefix_stats ? 'cri';
UPDATE auctions SET prefix_stats = jsonb_set(prefix_stats, '{cri}',
  to_jsonb(rebuild_crit_stat(item_id, prefix_ids, 'cri')), true) WHERE prefix_stats ? 'cri';
UPDATE account_storage_items SET prefix_stats = jsonb_set(prefix_stats, '{cri}',
  to_jsonb(rebuild_crit_stat(item_id, prefix_ids, 'cri')), true) WHERE prefix_stats ? 'cri';
UPDATE guild_storage_items SET prefix_stats = jsonb_set(prefix_stats, '{cri}',
  to_jsonb(rebuild_crit_stat(item_id, prefix_ids, 'cri')), true) WHERE prefix_stats ? 'cri';

-- crit_dmg_pct
UPDATE character_inventory SET prefix_stats = jsonb_set(prefix_stats, '{crit_dmg_pct}',
  to_jsonb(rebuild_crit_stat(item_id, prefix_ids, 'crit_dmg_pct')), true) WHERE prefix_stats ? 'crit_dmg_pct';
UPDATE character_equipped SET prefix_stats = jsonb_set(prefix_stats, '{crit_dmg_pct}',
  to_jsonb(rebuild_crit_stat(item_id, prefix_ids, 'crit_dmg_pct')), true) WHERE prefix_stats ? 'crit_dmg_pct';
UPDATE mailbox SET prefix_stats = jsonb_set(prefix_stats, '{crit_dmg_pct}',
  to_jsonb(rebuild_crit_stat(item_id, prefix_ids, 'crit_dmg_pct')), true) WHERE prefix_stats ? 'crit_dmg_pct';
UPDATE auctions SET prefix_stats = jsonb_set(prefix_stats, '{crit_dmg_pct}',
  to_jsonb(rebuild_crit_stat(item_id, prefix_ids, 'crit_dmg_pct')), true) WHERE prefix_stats ? 'crit_dmg_pct';
UPDATE account_storage_items SET prefix_stats = jsonb_set(prefix_stats, '{crit_dmg_pct}',
  to_jsonb(rebuild_crit_stat(item_id, prefix_ids, 'crit_dmg_pct')), true) WHERE prefix_stats ? 'crit_dmg_pct';
UPDATE guild_storage_items SET prefix_stats = jsonb_set(prefix_stats, '{crit_dmg_pct}',
  to_jsonb(rebuild_crit_stat(item_id, prefix_ids, 'crit_dmg_pct')), true) WHERE prefix_stats ? 'crit_dmg_pct';

DROP FUNCTION rebuild_crit_stat(int, int[], text);

COMMIT;
