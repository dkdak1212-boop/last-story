SET client_encoding TO 'UTF8';

\echo '=== char id=431 full info ==='
SELECT c.id, c.name, c.class_name, c.level, c.exp, c.gold, c.total_kills, c.total_gold_earned,
       c.stats, c.hp, c.max_hp, c.stat_points, c.node_points,
       c.created_at, c.last_online_at,
       EXTRACT(EPOCH FROM (c.last_online_at - c.created_at))/3600 AS hours_total,
       c.exp_boost_until, c.gold_boost_until, c.drop_boost_until
FROM characters c WHERE c.id = 431;

\echo ''
\echo '=== account (user id=123) info ==='
SELECT u.id, u.username, u.email, u.created_at, u.last_login_at, u.is_admin, u.banned,
       u.storage_gold, u.max_character_slots
FROM users u WHERE u.id = 123;

\echo ''
\echo '=== 계정의 다른 캐릭터 ==='
SELECT id, name, class_name, level, total_kills, gold FROM characters WHERE user_id = 123;

\echo ''
\echo '=== 431 장비 ==='
SELECT ce.slot, i.name, i.grade, ce.enhance_level, ce.quality, ce.prefix_stats
FROM character_equipped ce JOIN items i ON i.id = ce.item_id WHERE ce.character_id = 431;

\echo ''
\echo '=== 431 allocated nodes (이전 전체 리셋 이후) ==='
SELECT COUNT(*) AS count FROM character_nodes WHERE character_id = 431;

\echo ''
\echo '=== 431 우편함 (관리자 지급 이력) ==='
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE subject LIKE '%운영%' OR subject LIKE '%admin%') AS admin_mails,
       COALESCE(SUM(gold), 0) AS total_gold_mailed
FROM mailbox WHERE character_id = 431;

\echo ''
\echo '=== 431 인벤토리 상위 아이템 (강화/품질) ==='
SELECT ci.slot_index, i.name, i.grade, ci.enhance_level, ci.quality, ci.prefix_stats
FROM character_inventory ci JOIN items i ON i.id = ci.item_id
WHERE ci.character_id = 431
ORDER BY ci.enhance_level DESC, ci.quality DESC
LIMIT 15;

\echo ''
\echo '=== 같은 IP 가입 계정 (의심 멀티) ==='
SELECT u.id, u.username, u.registered_ip, u.created_at
FROM users u WHERE u.registered_ip = (SELECT registered_ip FROM users WHERE id = 123)
  AND u.registered_ip IS NOT NULL;
