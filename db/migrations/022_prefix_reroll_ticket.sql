-- 접두사 수치 재굴림권 소모품 아이템 추가
INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level)
VALUES (
  '접두사 수치 재굴림권',
  'consumable',
  'epic',
  NULL,
  NULL,
  '장비 접두사의 tier/옵션은 그대로 두고 수치만 새로 굴립니다. 강화 메뉴에서 사용할 수 있습니다.',
  300,
  1000,
  1
) ON CONFLICT DO NOTHING;
