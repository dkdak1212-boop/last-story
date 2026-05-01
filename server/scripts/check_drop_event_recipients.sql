SET client_encoding TO 'UTF8';
SELECT id, name, class_name, level,
       event_drop_pct, event_drop_until,
       drop_boost_until
FROM characters
WHERE name IN ('분노','나태','둥둥','일단','이단');
