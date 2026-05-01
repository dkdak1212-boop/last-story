SET client_encoding TO 'UTF8';

\echo === 일반유저 중 현재 시공의 균열(field:23)에 위치한 캐릭터 ===
SELECT c.id AS char_id, c.name, c.class_name, c.level, c.location,
       u.username, u.is_admin
  FROM characters c
  JOIN users u ON u.id = c.user_id
 WHERE c.location = 'field:23'
   AND COALESCE(u.is_admin, FALSE) = FALSE
 ORDER BY c.id;

\echo
\echo === combat_sessions 에 균열 세션 (admin 제외) ===
SELECT cs.character_id, c.name, c.level, u.username, u.is_admin, cs.field_id
  FROM combat_sessions cs
  JOIN characters c ON c.id = cs.character_id
  JOIN users u ON u.id = c.user_id
 WHERE cs.field_id = 23
   AND COALESCE(u.is_admin, FALSE) = FALSE;
