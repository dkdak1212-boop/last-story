-- T2 / T1 접두사 보장 추첨권 추가 — 종언의 기둥 일일 랭킹 보상용
-- 등급 정책: T3=legendary (id 840), T2=epic, T1=rare. sell_price=0 (판매 불가).
-- 사용 로직: 기존 T3 추첨권과 동일 패턴 — generateSinglePrefixOfTier 의 tier 파라미터만 다름.
-- 2026-04-27

INSERT INTO items (id, name, type, grade, description, stack_size, sell_price, required_level)
VALUES
  (856, 'T2 접두사 보장 추첨권', 'consumable', 'epic',
   '장비 1개에서 접두사 1개를 T2 티어로 재굴림합니다. 강화 메뉴에서 사용할 수 있습니다.',
   300, 0, 1),
  (857, 'T1 접두사 보장 추첨권', 'consumable', 'rare',
   '장비 1개에서 접두사 1개를 T1 티어로 재굴림합니다. 강화 메뉴에서 사용할 수 있습니다.',
   300, 0, 1)
ON CONFLICT (id) DO NOTHING;

SELECT setval('items_id_seq', GREATEST((SELECT MAX(id) FROM items), 857));
