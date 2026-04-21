-- 치명타 관련 접두사(cri / crit_dmg_pct / gauge_on_crit_pct)가 붙은 기존 아이템의
-- 저장된 수치를 현재 item_prefixes 의 max_val 로 일괄 상향 (B 방식).
-- 적용 범위: 유저가 실제 보유하거나 거래 중인 전체 테이블 6개.

BEGIN;

CREATE OR REPLACE FUNCTION apply_crit_max_to_prefix_stats(
  in_stats jsonb,
  in_prefix_ids int[]
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  out_stats jsonb := COALESCE(in_stats, '{}'::jsonb);
  k text;
  max_v int;
BEGIN
  IF in_prefix_ids IS NULL OR array_length(in_prefix_ids, 1) IS NULL THEN
    RETURN out_stats;
  END IF;
  FOREACH k IN ARRAY ARRAY['cri', 'crit_dmg_pct', 'gauge_on_crit_pct'] LOOP
    IF out_stats ? k THEN
      SELECT max(ip.max_val) INTO max_v
        FROM item_prefixes ip
       WHERE ip.id = ANY(in_prefix_ids) AND ip.stat_key = k;
      IF max_v IS NOT NULL THEN
        out_stats := jsonb_set(out_stats, ARRAY[k], to_jsonb(max_v), true);
      END IF;
    END IF;
  END LOOP;
  RETURN out_stats;
END;
$$;

-- 1) character_inventory
UPDATE character_inventory
   SET prefix_stats = apply_crit_max_to_prefix_stats(prefix_stats, prefix_ids)
 WHERE prefix_stats IS NOT NULL
   AND (prefix_stats ? 'cri'
     OR prefix_stats ? 'crit_dmg_pct'
     OR prefix_stats ? 'gauge_on_crit_pct');

-- 2) character_equipped
UPDATE character_equipped
   SET prefix_stats = apply_crit_max_to_prefix_stats(prefix_stats, prefix_ids)
 WHERE prefix_stats IS NOT NULL
   AND (prefix_stats ? 'cri'
     OR prefix_stats ? 'crit_dmg_pct'
     OR prefix_stats ? 'gauge_on_crit_pct');

-- 3) mailbox
UPDATE mailbox
   SET prefix_stats = apply_crit_max_to_prefix_stats(prefix_stats, prefix_ids)
 WHERE prefix_stats IS NOT NULL
   AND (prefix_stats ? 'cri'
     OR prefix_stats ? 'crit_dmg_pct'
     OR prefix_stats ? 'gauge_on_crit_pct');

-- 4) auctions
UPDATE auctions
   SET prefix_stats = apply_crit_max_to_prefix_stats(prefix_stats, prefix_ids)
 WHERE prefix_stats IS NOT NULL
   AND (prefix_stats ? 'cri'
     OR prefix_stats ? 'crit_dmg_pct'
     OR prefix_stats ? 'gauge_on_crit_pct');

-- 5) account_storage_items
UPDATE account_storage_items
   SET prefix_stats = apply_crit_max_to_prefix_stats(prefix_stats, prefix_ids)
 WHERE prefix_stats IS NOT NULL
   AND (prefix_stats ? 'cri'
     OR prefix_stats ? 'crit_dmg_pct'
     OR prefix_stats ? 'gauge_on_crit_pct');

-- 6) guild_storage_items
UPDATE guild_storage_items
   SET prefix_stats = apply_crit_max_to_prefix_stats(prefix_stats, prefix_ids)
 WHERE prefix_stats IS NOT NULL
   AND (prefix_stats ? 'cri'
     OR prefix_stats ? 'crit_dmg_pct'
     OR prefix_stats ? 'gauge_on_crit_pct');

DROP FUNCTION apply_crit_max_to_prefix_stats(jsonb, int[]);

COMMIT;
