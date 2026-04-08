SELECT id, character_id, subject, item_id, item_quantity, gold, read_at, created_at
FROM mailbox
WHERE subject LIKE '%경매%' OR subject LIKE '%판매%' OR subject LIKE '%입찰%'
ORDER BY id DESC LIMIT 10;
