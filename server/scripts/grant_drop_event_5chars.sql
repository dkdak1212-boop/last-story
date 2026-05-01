-- 분노/나태/둥둥/일단/이단 5명에게 드랍률 +200% 24시간 이벤트 지급
SET client_encoding TO 'UTF8';
BEGIN;

UPDATE characters
SET event_drop_pct = 200,
    event_drop_until = NOW() + INTERVAL '24 hours'
WHERE name IN ('분노','나태','둥둥','일단','이단');

SELECT id, name, class_name, level, event_drop_pct,
       event_drop_until AT TIME ZONE 'Asia/Seoul' AS until_kst
FROM characters
WHERE name IN ('분노','나태','둥둥','일단','이단')
ORDER BY name;

COMMIT;
