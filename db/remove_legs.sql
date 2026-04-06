-- 각반(legs) 아이템 완전 제거
BEGIN;

-- 각반 아이템 ID 수집
CREATE TEMP TABLE leg_items AS SELECT id FROM items WHERE slot = 'legs';

-- 참조 제거
DELETE FROM character_inventory WHERE item_id IN (SELECT id FROM leg_items);
DELETE FROM character_equipped  WHERE item_id IN (SELECT id FROM leg_items);
DELETE FROM character_equipped  WHERE slot = 'legs';
DELETE FROM mailbox             WHERE item_id IN (SELECT id FROM leg_items);

-- 경매: 각반 경매는 모두 취소 + 아이템 반환 없이 종료
UPDATE auctions SET cancelled = TRUE, settled = TRUE
  WHERE item_id IN (SELECT id FROM leg_items) AND settled = FALSE;
DELETE FROM auctions WHERE item_id IN (SELECT id FROM leg_items);

-- 퀘스트 보상 아이템 참조 제거
UPDATE quests SET reward_item_id = NULL, reward_item_qty = NULL
  WHERE reward_item_id IN (SELECT id FROM leg_items);

-- 상점 엔트리
DELETE FROM shop_entries WHERE item_id IN (SELECT id FROM leg_items);

-- 몬스터 drop_table에서 각반 ID 제거
UPDATE monsters SET drop_table = (
  SELECT COALESCE(jsonb_agg(d), '[]'::jsonb)
  FROM jsonb_array_elements(drop_table) d
  WHERE (d->>'itemId')::int NOT IN (SELECT id FROM leg_items)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(drop_table) d
  WHERE (d->>'itemId')::int IN (SELECT id FROM leg_items)
);

-- 아이템 삭제
DELETE FROM items WHERE slot = 'legs';

DROP TABLE leg_items;
COMMIT;

SELECT COUNT(*) AS remaining_legs FROM items WHERE slot = 'legs';
