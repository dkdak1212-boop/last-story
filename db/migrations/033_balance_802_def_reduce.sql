-- 802 차원 분쇄자 밸런스: def_reduce_pct 15 → 10
--  · items 마스터: unique_prefix_stats + description
--  · 기존 인스턴스(character_inventory/equipped/mailbox/auctions/storage): stored prefix_stats.def_reduce_pct -= 5
--    (rolled 기여 + old_unique(15) 에서 old_unique 5 감액, rolled 보존)
SET client_encoding TO 'UTF8';
BEGIN;

UPDATE items
   SET unique_prefix_stats = '{"atk_pct":10, "crit_dmg_pct":22, "def_reduce_pct":10}'::jsonb,
       description = '[유니크] 공격력 +10%, 치명타 데미지 +22%, 몬스터 방어력 -10%'
 WHERE id = 802;

-- 6개 테이블 prefix_stats 리빌드 (def_reduce_pct 키 있을 때만, -5 차감)
UPDATE character_inventory
   SET prefix_stats = jsonb_set(
         prefix_stats,
         '{def_reduce_pct}',
         to_jsonb(GREATEST(0, COALESCE((prefix_stats->>'def_reduce_pct')::int, 0) - 5))
       )
 WHERE item_id = 802 AND prefix_stats ? 'def_reduce_pct';

UPDATE character_equipped
   SET prefix_stats = jsonb_set(
         prefix_stats,
         '{def_reduce_pct}',
         to_jsonb(GREATEST(0, COALESCE((prefix_stats->>'def_reduce_pct')::int, 0) - 5))
       )
 WHERE item_id = 802 AND prefix_stats ? 'def_reduce_pct';

UPDATE mailbox
   SET prefix_stats = jsonb_set(
         prefix_stats,
         '{def_reduce_pct}',
         to_jsonb(GREATEST(0, COALESCE((prefix_stats->>'def_reduce_pct')::int, 0) - 5))
       )
 WHERE item_id = 802 AND prefix_stats ? 'def_reduce_pct';

UPDATE auctions
   SET prefix_stats = jsonb_set(
         prefix_stats,
         '{def_reduce_pct}',
         to_jsonb(GREATEST(0, COALESCE((prefix_stats->>'def_reduce_pct')::int, 0) - 5))
       )
 WHERE item_id = 802 AND prefix_stats ? 'def_reduce_pct';

UPDATE account_storage_items
   SET prefix_stats = jsonb_set(
         prefix_stats,
         '{def_reduce_pct}',
         to_jsonb(GREATEST(0, COALESCE((prefix_stats->>'def_reduce_pct')::int, 0) - 5))
       )
 WHERE item_id = 802 AND prefix_stats ? 'def_reduce_pct';

UPDATE guild_storage_items
   SET prefix_stats = jsonb_set(
         prefix_stats,
         '{def_reduce_pct}',
         to_jsonb(GREATEST(0, COALESCE((prefix_stats->>'def_reduce_pct')::int, 0) - 5))
       )
 WHERE item_id = 802 AND prefix_stats ? 'def_reduce_pct';

SELECT id, name, unique_prefix_stats, description FROM items WHERE id = 802;

COMMIT;
