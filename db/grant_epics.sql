INSERT INTO mailbox (character_id, subject, body, item_id, item_quantity)
SELECT 3, '에픽 장비 지급', '관리자가 지급한 에픽 아이템입니다.', id, 1
FROM items WHERE grade = 'epic';
