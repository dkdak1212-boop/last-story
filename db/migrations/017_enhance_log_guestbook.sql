-- 강화 로그 (10강 이상 성공/실패/파괴)
CREATE TABLE IF NOT EXISTS enhance_log (
  id SERIAL PRIMARY KEY,
  character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_grade TEXT NOT NULL,
  from_level INT NOT NULL,
  to_level INT,
  success BOOLEAN NOT NULL,
  destroyed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_enhance_log_time ON enhance_log (created_at DESC);

-- 방명록
CREATE TABLE IF NOT EXISTS guestbook (
  id SERIAL PRIMARY KEY,
  character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guestbook_time ON guestbook (created_at DESC);
