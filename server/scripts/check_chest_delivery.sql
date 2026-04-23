-- 우편함에 상자 아이템이 제대로 첨부되었는지 확인
SELECT m.id, m.character_id, c.name AS char_name, m.subject, m.item_id, m.item_quantity, m.created_at, m.read_at,
       i.name AS item_name
FROM mailbox m
LEFT JOIN characters c ON c.id = m.character_id
LEFT JOIN items i ON i.id = m.item_id
WHERE m.item_id IN (843, 844, 845)
ORDER BY m.created_at DESC
LIMIT 10;

-- 인벤에 상자가 들어간 것도 확인
SELECT ci.character_id, c.name AS char_name, ci.item_id, ci.slot_index, ci.quantity, i.name AS item_name
FROM character_inventory ci
JOIN characters c ON c.id = ci.character_id
JOIN items i ON i.id = ci.item_id
WHERE ci.item_id IN (843, 844, 845)
ORDER BY ci.id DESC
LIMIT 10;
