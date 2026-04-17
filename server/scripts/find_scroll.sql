SET client_encoding TO 'UTF8';
SELECT id, name, type, grade FROM items WHERE name LIKE '%찢어진%' OR name LIKE '%스크롤%' ORDER BY id;
