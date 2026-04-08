-- 찢어진 스크롤 (드롭 재료)
INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level)
VALUES ('찢어진 스크롤', 'material', 'rare', NULL, NULL, '고대 문자가 적힌 스크롤 조각. 3개를 모으면 복원할 수 있다.', 300, 200, 1);

-- 노드 스크롤 +8 (결과 아이템 - 소비 아이템)
INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level)
VALUES ('노드 스크롤 +8', 'consumable', 'epic', NULL, NULL, '사용 시 노드 포인트 8을 획득합니다.', 300, 2000, 1);

-- ID 확인
SELECT id, name, type, grade FROM items WHERE name IN ('찢어진 스크롤', '노드 스크롤 +8');
