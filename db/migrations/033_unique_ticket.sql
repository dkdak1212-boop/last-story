-- 길드 보스 황금 상자 잭팟 — 유니크 무작위 추첨권 아이템화
-- 기존엔 잭팟 발동 시 즉시 유니크 지급. 이제는 추첨권 아이템을 지급하고
-- 유저가 나중에 사용해서 유니크를 뽑도록 변경.

INSERT INTO items (name, type, grade, stack_size, sell_price, required_level, description)
SELECT '유니크 무작위 추첨권', 'consumable', 'legendary', 300, 0, 1,
       '사용 시 캐릭터 레벨 ±10 범위의 유니크 아이템 중 무작위 1개를 받습니다. 인벤토리에서 사용할 수 있습니다.'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = '유니크 무작위 추첨권');
