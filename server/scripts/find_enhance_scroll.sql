SET client_encoding TO 'UTF8';
SELECT id, name, type, grade FROM items WHERE name LIKE '%강화%' OR name LIKE '%스크롤%' ORDER BY id;
