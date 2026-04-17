SET client_encoding TO 'UTF8';
SELECT * FROM node_definitions WHERE effects::text LIKE '%time_lord%' OR name LIKE '%시간%';
