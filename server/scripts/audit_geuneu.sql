SET client_encoding TO 'UTF8';

\echo '=== 근느 (id=13) 전체 인벤토리 ==='
SELECT ci.slot_index, i.name, i.grade, ci.enhance_level, ci.quantity
FROM character_inventory ci
JOIN items i ON i.id = ci.item_id
WHERE ci.character_id = 13
ORDER BY i.grade DESC, ci.enhance_level DESC
LIMIT 30;

\echo ''
\echo '=== 근느 계정 (user) 정보 ==='
SELECT u.id, u.username, u.email, u.created_at, u.is_admin, u.banned,
       (SELECT COUNT(*) FROM characters WHERE user_id = u.id) AS char_count
FROM characters c JOIN users u ON u.id = c.user_id WHERE c.id = 13;

\echo ''
\echo '=== 근느 우편함 (이미 수령 포함) ==='
SELECT id, subject, LEFT(body, 60) AS body, item_id, item_quantity, gold, read_at, created_at
FROM mailbox WHERE character_id = 13 ORDER BY created_at DESC LIMIT 20;

\echo ''
\echo '=== 근느가 우편으로 받은 골드/exp_booster 총량 ==='
SELECT COUNT(*) AS total_mails,
       COALESCE(SUM(gold), 0) AS total_gold,
       COUNT(*) FILTER (WHERE item_id IS NOT NULL) AS item_mails
FROM mailbox WHERE character_id = 13;

\echo ''
\echo '=== #2 전사 (id=431) 이름이 빈 문자열 ==='
SELECT id, name, level, class_name, user_id, created_at FROM characters WHERE id = 431;
SELECT u.id, u.username FROM users u JOIN characters c ON c.user_id = u.id WHERE c.id = 431;
