-- 1) 구나희 캐릭의 user_id + 같은 계정의 다른 캐릭
SELECT c.id, c.name, c.class_name, c.level, c.location, c.last_online_at, c.user_id, u.username, u.email, u.registered_ip, u.created_at
FROM characters c
JOIN users u ON u.id = c.user_id
WHERE c.name = '구나희';

-- 2) 구나희 소유 user의 전체 캐릭
SELECT c.id, c.name, c.class_name, c.level, c.last_online_at
FROM characters c
WHERE c.user_id = (SELECT user_id FROM characters WHERE name = '구나희' LIMIT 1)
ORDER BY c.id;

-- 3) 같은 registered_ip 를 공유하는 계정들
SELECT u.id, u.username, u.email, u.registered_ip, u.created_at, u.last_login_at,
       (SELECT COUNT(*) FROM characters c WHERE c.user_id = u.id) AS char_count,
       (SELECT string_agg(c.name, ', ') FROM characters c WHERE c.user_id = u.id) AS char_names
FROM users u
WHERE u.registered_ip IS NOT NULL
  AND u.registered_ip = (
    SELECT u2.registered_ip FROM users u2
    JOIN characters c2 ON c2.user_id = u2.id
    WHERE c2.name = '구나희' LIMIT 1
  )
ORDER BY u.created_at;

-- 4) 같은 email 도메인/패턴
SELECT u.id, u.username, u.email, u.registered_ip, u.created_at,
       (SELECT COUNT(*) FROM characters c WHERE c.user_id = u.id) AS char_count
FROM users u
WHERE u.email IS NOT NULL AND u.email = (
  SELECT u2.email FROM users u2
  JOIN characters c2 ON c2.user_id = u2.id
  WHERE c2.name = '구나희' LIMIT 1
)
ORDER BY u.created_at;
