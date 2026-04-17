-- 길드 보스 보상 아이템 실체화
-- 품질 재굴림권 신설 + 계정 창고 슬롯 보너스 컬럼

INSERT INTO items (name, type, grade, stack_size, sell_price, required_level, description)
SELECT '품질 재굴림권', 'consumable', 'epic', 300, 0, 1,
       '장비 1개의 품질 수치(0~100)를 새로 굴립니다. 강화 메뉴에서 사용할 수 있습니다.'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = '품질 재굴림권');

ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_slots_bonus INT NOT NULL DEFAULT 0;
