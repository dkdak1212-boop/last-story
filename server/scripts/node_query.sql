SET client_encoding TO 'UTF8';
SELECT id, name, description, effects FROM node_definitions WHERE name LIKE '%분노%' OR description LIKE '%분노%';
