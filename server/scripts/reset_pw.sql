SET client_encoding TO 'UTF8';
UPDATE users SET password_hash = '$2a$10$cp1MLyoJD7EBBAqd5Vchou0xaU13TXC8PXAYPQKG25Gi7TM157a7W' WHERE username = 'pd5917' RETURNING id, username;
