SET client_encoding TO 'UTF8';

\echo === BEFORE: location 이 field 인데 last_offline_at NULL 인 캐릭 ===
SELECT COUNT(*)::int AS pending_settle
  FROM characters
 WHERE location LIKE 'field:%'
   AND last_offline_at IS NULL;

\echo
\echo === BEFORE 샘플 (상위 10명) ===
SELECT id, name, level, location, last_online_at
  FROM characters
 WHERE location LIKE 'field:%'
   AND last_offline_at IS NULL
 ORDER BY last_online_at DESC NULLS LAST
 LIMIT 10;

\echo
\echo === FIX 실행 ===
BEGIN;
UPDATE characters
   SET last_offline_at = COALESCE(last_online_at, NOW()),
       last_field_id_offline = CAST(SUBSTRING(location FROM 7) AS INTEGER)
 WHERE location LIKE 'field:%'
   AND last_offline_at IS NULL
   AND SUBSTRING(location FROM 7) ~ '^[0-9]+$';

\echo
\echo === AFTER: 보정 후 ===
SELECT COUNT(*)::int AS still_null
  FROM characters
 WHERE location LIKE 'field:%'
   AND last_offline_at IS NULL;

COMMIT;
