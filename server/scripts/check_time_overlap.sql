-- user 605, 869, 89, 107, 148 의 로그인 시각과 IP
SELECT user_id, ip, provider, created_at
FROM user_login_log
WHERE user_id IN (89, 107, 148, 605, 869)
ORDER BY created_at;

-- 각 user 의 가입 시점 + 캐릭
SELECT u.id, u.email, u.registered_ip, u.created_at, u.last_login_at,
       (SELECT string_agg(c.name, ', ') FROM characters c WHERE c.user_id = u.id) AS chars,
       (SELECT COUNT(*) FROM user_login_log ull WHERE ull.user_id = u.id) AS login_cnt
FROM users u WHERE u.id IN (89, 107, 148, 605, 869)
ORDER BY u.created_at;

-- user 89, 107, 148 이 고정 IP (125.x, 106.252.x, 210.108.x, 106.101.81.x) 공유 흔적
SELECT ull.user_id, ull.ip, ull.created_at, u.email
FROM user_login_log ull JOIN users u ON u.id = ull.user_id
WHERE ull.user_id IN (89, 107, 148)
  AND (ull.ip LIKE '125.190.%' OR ull.ip LIKE '106.252.%' OR ull.ip LIKE '210.108.%' OR ull.ip LIKE '106.101.81.%')
ORDER BY ull.created_at;
