-- user 605 + 869 의 로그인 IP 이력
SELECT user_id, ip, provider, created_at
FROM user_login_log
WHERE user_id IN (605, 869)
ORDER BY created_at DESC
LIMIT 40;

-- 605/869 가 한번이라도 쓴 IP 목록
SELECT DISTINCT ip FROM user_login_log WHERE user_id IN (605, 869);

-- 동일 IP 를 공유한 다른 user 조회
SELECT DISTINCT u.id, u.username, u.email, u.registered_ip,
       (SELECT string_agg(DISTINCT ull2.ip, ', ')
        FROM user_login_log ull2
        WHERE ull2.user_id = u.id
          AND ull2.ip IN (SELECT DISTINCT ull3.ip FROM user_login_log ull3 WHERE ull3.user_id IN (605, 869))
       ) AS shared_ips,
       (SELECT string_agg(c.name, ', ') FROM characters c WHERE c.user_id = u.id) AS chars
FROM users u
JOIN user_login_log ull ON ull.user_id = u.id
WHERE ull.ip IN (SELECT DISTINCT ull2.ip FROM user_login_log ull2 WHERE ull2.user_id IN (605, 869))
GROUP BY u.id, u.username, u.email, u.registered_ip
ORDER BY u.created_at;
