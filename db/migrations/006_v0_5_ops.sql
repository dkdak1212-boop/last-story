-- v0.5 (옵션 B): 공지 / 피드백 / 관리자
BEGIN;

-- 관리자 플래그
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 공지사항
CREATE TABLE IF NOT EXISTS announcements (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(100) NOT NULL,
  body        TEXT NOT NULL,
  priority    VARCHAR(20) NOT NULL DEFAULT 'normal',  -- normal|important|urgent
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  author_id   INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(active, created_at DESC);

-- 공지 읽음 기록 (팝업 중복 방지)
CREATE TABLE IF NOT EXISTS announcement_reads (
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, announcement_id)
);

-- 피드백
CREATE TABLE IF NOT EXISTS feedback (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  category     VARCHAR(20) NOT NULL,   -- bug|suggestion|balance|other
  text         TEXT NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'open',  -- open|reviewing|resolved|closed
  admin_note   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at DESC);

COMMIT;
