SET client_encoding TO 'UTF8';

\echo '=== 431 user_id + account ==='
SELECT c.id, c.name, c.user_id, u.username, u.email, u.registered_ip, u.created_at, u.banned, u.is_admin
FROM characters c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = 431;

\echo ''
\echo '=== 같은 계정의 모든 캐릭터 ==='
SELECT c2.id, c2.name, c2.class_name, c2.level, c2.total_kills
FROM characters c1 JOIN characters c2 ON c2.user_id = c1.user_id WHERE c1.id = 431;

\echo ''
\echo '=== 같은 IP 계정 전체 ==='
SELECT u.id, u.username, u.created_at, u.registered_ip,
       (SELECT COUNT(*) FROM characters WHERE user_id = u.id) AS chars
FROM users u
WHERE u.registered_ip = (SELECT u2.registered_ip FROM users u2 JOIN characters c ON c.user_id = u2.id WHERE c.id = 431);

\echo ''
\echo '=== 정상 warrior 평균 stat 총합 (비교용) ==='
SELECT AVG((stats->>'str')::int + (stats->>'dex')::int + (stats->>'int')::int + (stats->>'vit')::int + COALESCE((stats->>'spd')::int,0) + COALESCE((stats->>'cri')::int,0)) AS avg_total_stats,
       MAX((stats->>'str')::int + (stats->>'dex')::int + (stats->>'int')::int + (stats->>'vit')::int + COALESCE((stats->>'spd')::int,0) + COALESCE((stats->>'cri')::int,0)) AS max_total_stats
FROM characters WHERE class_name='warrior' AND level BETWEEN 80 AND 85;

\echo ''
\echo '=== 431 현재 stat 총합 ==='
SELECT ((stats->>'str')::int + (stats->>'dex')::int + (stats->>'int')::int + (stats->>'vit')::int + COALESCE((stats->>'spd')::int,0) + COALESCE((stats->>'cri')::int,0)) AS total_stats
FROM characters WHERE id = 431;

\echo ''
\echo '=== 431 접속 로그 / 마지막 전투 ==='
SELECT c.last_online_at,
       EXTRACT(EPOCH FROM (NOW() - c.created_at))/3600 AS hours_since_creation,
       c.total_kills::float / NULLIF(EXTRACT(EPOCH FROM (c.last_online_at - c.created_at))/3600, 0) AS kills_per_hour
FROM characters c WHERE c.id = 431;

\echo ''
\echo '=== 이 계정의 premium 구매 이력 ==='
SELECT pp.product_id, pp.amount_krw, pp.purchased_at
FROM premium_purchases pp JOIN characters c ON c.user_id = pp.user_id WHERE c.id = 431
ORDER BY pp.purchased_at DESC;
