-- 추출(Extract) + 미확인(Unidentified) 제작 시스템
-- 1) 신비한가루(910), T3 접두사 보장 추첨권(911) 신규 아이템
-- 2) character_inventory / auctions / mailbox 에 unidentified 플래그 추가
-- 3) craft_recipes 에 extra_materials (JSONB) — 멀티 재료 레시피 지원
-- 4) result_type 확장: 'unidentified_set' (옵션 미확인 시공균열 세트템 제작)
-- 5) 신규 레시피 14: 신비한가루×20 → T3 추첨권
-- 6) 신규 레시피 15: 차원파편×2500 + 시공의정수×2500 + 균열의핵×1000 → 시공균열 세트 미확인템

-- ── 1) 신규 아이템 ──
INSERT INTO items (id, name, type, slot, grade, required_level, stats, description, stack_size, sell_price, bound_on_pickup) VALUES
  (910, '신비한 가루',                'material',   NULL, 'rare',   1, '{}'::jsonb,
   'T4 접두사 장비를 추출하면 1개 생성. 추첨권 제작 재료.',
   9999, 0, FALSE),
  (911, 'T3 접두사 보장 추첨권',      'consumable', NULL, 'epic',   1, '{}'::jsonb,
   '인벤토리의 장비 1개에 사용해 T3 보장 + 2/3옵션 재굴림. (추후 사용 UI 별도)',
   99,   0, FALSE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  stack_size = EXCLUDED.stack_size, type = EXCLUDED.type, grade = EXCLUDED.grade;

-- ── 2) unidentified 플래그 ──
ALTER TABLE character_inventory
  ADD COLUMN IF NOT EXISTS unidentified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS unidentified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE mailbox
  ADD COLUMN IF NOT EXISTS unidentified BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 3) 멀티 재료 컬럼 ──
ALTER TABLE craft_recipes
  ADD COLUMN IF NOT EXISTS extra_materials JSONB NOT NULL DEFAULT '[]'::jsonb;
-- 형식: [{"itemId": 853, "qty": 2500}, {"itemId": 854, "qty": 1000}]

-- ── 4) result_type 'unidentified_set' 확장 (코드에서 분기) ──
-- (기존 enum/check constraint 없음 → 텍스트 컬럼이라 추가 작업 불필요)

-- ── 5) 레시피 14: 신비한 가루 20 → T3 추첨권 ──
INSERT INTO craft_recipes (id, name, material_item_id, material_qty, result_type, result_item_ids, set_id, extra_materials)
VALUES (
  14,
  'T3 접두사 보장 추첨권 제작 (신비한 가루 20)',
  910, 20,
  'consumable',
  ARRAY[911]::int[],
  NULL,
  '[]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  material_item_id = EXCLUDED.material_item_id,
  material_qty = EXCLUDED.material_qty,
  result_type = EXCLUDED.result_type,
  result_item_ids = EXCLUDED.result_item_ids,
  extra_materials = EXCLUDED.extra_materials;

-- ── 6) 레시피 15: 시공균열 세트 미확인템 ──
-- 차원파편(852) ×2500 + 시공의정수(853) ×2500 + 균열의핵(854) ×1000
-- 결과: 시공균열 세트 10종 (900-909) 중 무작위, unidentified=TRUE, 거래 가능
INSERT INTO craft_recipes (id, name, material_item_id, material_qty, result_type, result_item_ids, set_id, extra_materials)
VALUES (
  15,
  '시공의 균열 세트 (미확인) — 차원파편 2500 + 시공의정수 2500 + 균열의핵 1000',
  852, 2500,
  'unidentified_set',
  ARRAY[900, 901, 902, 903, 904, 905, 906, 907, 908, 909]::int[],
  4,
  '[{"itemId": 853, "qty": 2500}, {"itemId": 854, "qty": 1000}]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  material_item_id = EXCLUDED.material_item_id,
  material_qty = EXCLUDED.material_qty,
  result_type = EXCLUDED.result_type,
  result_item_ids = EXCLUDED.result_item_ids,
  set_id = EXCLUDED.set_id,
  extra_materials = EXCLUDED.extra_materials;

-- 시퀀스 동기화 (수동 ID 사용 후)
SELECT setval(pg_get_serial_sequence('items', 'id'),
              GREATEST((SELECT MAX(id) FROM items), 911));
SELECT setval(pg_get_serial_sequence('craft_recipes', 'id'),
              GREATEST((SELECT MAX(id) FROM craft_recipes), 15));
