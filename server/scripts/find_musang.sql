SET client_encoding TO 'UTF8';
SELECT id, name, description, class_name FROM skills WHERE name LIKE '%무쌍%' OR description LIKE '%무쌍%';
