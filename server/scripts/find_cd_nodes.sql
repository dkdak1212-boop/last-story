SET client_encoding TO 'UTF8';
SELECT id, name, description, class_exclusive, effects FROM node_definitions
WHERE effects::text LIKE '%cooldown%' OR effects::text LIKE '%mana_flow%'
ORDER BY id;
