SET client_encoding TO 'UTF8';

\echo '=== 1. Premium 구매 이력 (buff 아이템 포함) ==='
SELECT id, item_code, character_id, created_at
FROM premium_purchases WHERE user_id = 281 ORDER BY created_at DESC LIMIT 30;

\echo ''
\echo '=== 2. 우편함 전체 (보낸사람/내용 분석) ==='
SELECT id, LEFT(subject, 40) AS subject, LEFT(body, 80) AS body,
       item_id, item_quantity, gold, read_at IS NOT NULL AS read, created_at
FROM mailbox WHERE character_id = 431 ORDER BY created_at;

\echo ''
\echo '=== 3. 거래소 판매 이력 (settled 매물) ==='
SELECT a.id, i.name AS item, a.item_quantity, a.start_price, a.buyout_price, a.settled, a.cancelled, a.created_at, a.ends_at
FROM auctions a JOIN items i ON i.id = a.item_id
WHERE a.seller_id = 431 ORDER BY a.created_at DESC LIMIT 20;

\echo ''
\echo '=== 4. 거래소 판매 총 골드 수입 추정 (수수료 포함된 mail.gold 합) ==='
SELECT COUNT(*) AS mail_count, COALESCE(SUM(gold), 0) AS mail_gold_total
FROM mailbox WHERE character_id = 431 AND subject LIKE '%판매%';

\echo ''
\echo '=== 5. PvP 전투 이력 ==='
SELECT COUNT(*) AS pvp_battles FROM pvp_battles WHERE attacker_id = 431 OR defender_id = 431;

\echo ''
\echo '=== 6. 일일 임무 완료 수 (보상 수령 통계) ==='
SELECT COUNT(*) AS completed_days,
       COUNT(*) FILTER (WHERE completed = TRUE) AS completed_count
FROM character_daily_quests WHERE character_id = 431;

\echo ''
\echo '=== 7. 업적 달성 ==='
SELECT COUNT(*) AS achievement_count FROM character_achievements WHERE character_id = 431;

\echo ''
\echo '=== 8. 노드 54개 할당 내역 (어떤 노드 찍었나) ==='
SELECT cn.node_id, nd.name, nd.cost, nd.tier, nd.zone, nd.class_exclusive, cn.invested_at
FROM character_nodes cn JOIN node_definitions nd ON nd.id = cn.node_id
WHERE cn.character_id = 431 ORDER BY cn.invested_at DESC LIMIT 20;

\echo ''
\echo '=== 9. 이 계정 로그인 로그 (users.last_login_at만 있음) ==='
SELECT id, username, created_at, last_login_at,
       EXTRACT(EPOCH FROM (last_login_at - created_at))/3600 AS account_age_hours
FROM users WHERE id = 281;

\echo ''
\echo '=== 10. 강화 로그 (얼마나 강화했나) ==='
SELECT COUNT(*) AS enhance_attempts,
       COUNT(*) FILTER (WHERE success = TRUE) AS success_count,
       COUNT(*) FILTER (WHERE destroyed = TRUE) AS destroyed_count
FROM enhance_log WHERE character_id = 431;

\echo ''
\echo '=== 11. 드랍 로그 (유니크 드랍 받은 것) ==='
SELECT COUNT(*) AS total_drops,
       COUNT(*) FILTER (WHERE i.grade = 'unique') AS unique_drops,
       COUNT(*) FILTER (WHERE i.grade = 'epic') AS epic_drops
FROM item_drop_log dl JOIN items i ON i.id = dl.item_id
WHERE dl.character_id = 431;

\echo ''
\echo '=== 12. 같은 IP 다른 계정 여부 (멀티) ==='
SELECT u.id, u.username, u.created_at,
       (SELECT MAX(level) FROM characters WHERE user_id = u.id) AS max_char_level
FROM users u WHERE registered_ip = '115.138.247.35';
