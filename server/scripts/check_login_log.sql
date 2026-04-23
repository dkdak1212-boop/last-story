-- user_login_log 구조
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user_login_log' ORDER BY ordinal_position;

-- user 605 (joonggyu5845) + 869 (joonggyu0410) 의 로그인 IP 이력
SELECT user_id, login_ip, login_at
FROM user_login_log
WHERE user_id IN (605, 869)
ORDER BY login_at DESC
LIMIT 50;

-- user 605 / 869 가 로그인한 IP 들과 동일 IP 를 쓰는 다른 계정들
SELECT DISTINCT u.id, u.username, u.email, u.registered_ip,
       (SELECT string_agg(DISTINCT ull2.login_ip, ', ')
        FROM user_login_log ull2
        WHERE ull2.user_id = u.id
          AND ull2.login_ip IN (
            SELECT DISTINCT ull3.login_ip FROM user_login_log ull3 WHERE ull3.user_id IN (605, 869)
          )) AS shared_ips,
       (SELECT string_agg(c.name, ', ') FROM characters c WHERE c.user_id = u.id) AS chars
FROM users u
WHERE u.id IN (
  SELECT DISTINCT ull.user_id FROM user_login_log ull
  WHERE ull.login_ip IN (
    SELECT DISTINCT ull2.login_ip FROM user_login_log ull2 WHERE ull2.user_id IN (605, 869)
  )
)
ORDER BY u.created_at;
