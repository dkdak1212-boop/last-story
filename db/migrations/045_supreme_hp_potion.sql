-- 최고급 체력 물약 (id=108) — HP 100% 회복.
-- 시리즈: 작은(20%) / 중급(40%) / 고급(60%) / 최상급(80%) / 최고급(100%).
-- 일반 상점에 10000G 등록.

BEGIN;

INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price)
VALUES (108, '최고급 체력 물약', 'consumable', 'common', NULL, NULL, '최대 HP 100% 회복', 300, 2000)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  stack_size = EXCLUDED.stack_size,
  sell_price = EXCLUDED.sell_price;

-- shop_entries id 12 (id 11 비어있음 — 11 부여)
INSERT INTO shop_entries (id, item_id, buy_price, stock)
VALUES (11, 108, 10000, -1)
ON CONFLICT (id) DO UPDATE SET
  item_id = EXCLUDED.item_id,
  buy_price = EXCLUDED.buy_price,
  stock = EXCLUDED.stock;

COMMIT;
