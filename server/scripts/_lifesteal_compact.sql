SET client_encoding TO 'UTF8';

SELECT id || '|' || COALESCE(class_exclusive,'-') || '|' || tier || '|' || name || '|' || description
  FROM node_definitions
 WHERE effects::text LIKE '%lifesteal%' OR description LIKE E'%흡혈%'
 ORDER BY class_exclusive NULLS FIRST, id;
