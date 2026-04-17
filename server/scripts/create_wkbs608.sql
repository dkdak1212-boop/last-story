SET client_encoding TO 'UTF8';
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_hidden BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO users (username, password_hash, email, is_admin, chat_hidden, max_character_slots)
VALUES ('wkbs608', '$2a$10$jN3ibXzl0b1g7945riCSs.9dCixCPpMSsWSuKZC0Tfj1Nk5Fj/O7u', 'wkbs608@admin.local', TRUE, TRUE, 3)
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  is_admin = TRUE,
  chat_hidden = TRUE
RETURNING id, username, is_admin, chat_hidden;
