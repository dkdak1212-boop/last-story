-- 1) '나희' 또는 '구나희' 관련 이름 (부분 일치)
SELECT c.id, c.name, c.class_name, c.level, c.user_id, u.username, u.email, u.registered_ip, u.created_at, c.last_online_at
FROM characters c
JOIN users u ON u.id = c.user_id
WHERE c.name LIKE '%나희%' OR c.name LIKE '%구나%'
ORDER BY c.last_online_at DESC;

-- 2) 동일 IP 대역(106.101.81.*) 근처 계정
SELECT u.id, u.username, u.email, u.registered_ip, u.created_at,
       (SELECT string_agg(c.name, ', ') FROM characters c WHERE c.user_id = u.id) AS chars
FROM users u
WHERE u.registered_ip LIKE '106.101.81.%' OR u.registered_ip LIKE '106.101.8_.%'
ORDER BY u.created_at;

-- 3) joonggyu 이메일 패턴 / 근처 시각 가입한 계정
SELECT u.id, u.username, u.email, u.registered_ip, u.created_at,
       (SELECT string_agg(c.name || '(' || c.class_name || ' Lv' || c.level || ')', ', ') FROM characters c WHERE c.user_id = u.id) AS chars
FROM users u
WHERE u.email LIKE '%joonggyu%' OR u.email LIKE 'joonggyu%'
ORDER BY u.created_at;

-- 4) 2026-04-22 13:00~14:00 사이 같은 시간대에 가입한 계정들 (대량 생성 흔적)
SELECT u.id, u.username, u.email, u.registered_ip, u.created_at,
       (SELECT string_agg(c.name, ', ') FROM characters c WHERE c.user_id = u.id) AS chars
FROM users u
WHERE u.created_at BETWEEN '2026-04-22 12:30' AND '2026-04-22 14:00'
ORDER BY u.created_at;

-- 5) 같은 길드 소속 (있으면 공유 길드원과 함께 활동 패턴)
SELECT c.id, c.name, c.class_name, c.level, gm.guild_id, g.name AS guild_name, c.user_id
FROM characters c
LEFT JOIN guild_members gm ON gm.character_id = c.id
LEFT JOIN guilds g ON g.id = gm.guild_id
WHERE c.name IN ('구나희', '나희')
  OR gm.guild_id = (SELECT gm2.guild_id FROM guild_members gm2 JOIN characters c2 ON c2.id = gm2.character_id WHERE c2.name = '구나희' LIMIT 1);
