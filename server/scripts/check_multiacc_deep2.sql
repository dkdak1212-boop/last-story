-- 로그인/세션 관련 테이블 찾기
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND (table_name LIKE '%login%' OR table_name LIKE '%session%' OR table_name LIKE '%ip%' OR table_name LIKE '%audit%' OR table_name LIKE '%log%')
ORDER BY table_name;

-- 도둑양성소 길드원들의 user 정보 (가입 시점, IP 근거리 확인)
SELECT u.id, u.username, u.email, u.registered_ip, u.created_at, u.last_login_at,
       (SELECT string_agg(c.name, ', ') FROM characters c WHERE c.user_id = u.id) AS chars
FROM users u
WHERE u.id IN (
  SELECT DISTINCT c.user_id FROM characters c
  JOIN guild_members gm ON gm.character_id = c.id
  WHERE gm.guild_id = 42
)
ORDER BY u.created_at;

-- user 605 와 869 의 캐릭터 필드/위치 비교
SELECT c.id, c.name, c.class_name, c.level, c.location, c.last_online_at, c.user_id
FROM characters c
WHERE c.user_id IN (605, 869)
ORDER BY c.user_id, c.id;
