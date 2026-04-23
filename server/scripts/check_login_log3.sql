-- 605/869 가 쓴 IP 9개를 공유하는 모든 계정
SELECT u.id, u.username, u.email, u.registered_ip, u.created_at,
       (SELECT string_agg(DISTINCT ull2.ip, ', ')
        FROM user_login_log ull2
        WHERE ull2.user_id = u.id
          AND ull2.ip IN ('106.101.81.204','106.101.81.36','106.252.25.112','125.190.112.44','210.108.200.31','98.98.56.72','98.98.57.11','98.98.57.35','98.98.57.43')
       ) AS shared_ips,
       (SELECT string_agg(c.name || '(' || c.class_name || ' Lv' || c.level || ')', ', ') FROM characters c WHERE c.user_id = u.id) AS chars
FROM users u
WHERE u.id IN (
  SELECT DISTINCT ull.user_id FROM user_login_log ull
  WHERE ull.ip IN ('106.101.81.204','106.101.81.36','106.252.25.112','125.190.112.44','210.108.200.31','98.98.56.72','98.98.57.11','98.98.57.35','98.98.57.43')
)
ORDER BY u.created_at;
