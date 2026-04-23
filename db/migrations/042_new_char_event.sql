-- 신규 캐릭 EXP 이벤트 — 간단한 key-value 설정 테이블 (없으면 생성)
CREATE TABLE IF NOT EXISTS server_settings (
  key   VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기본값: 이벤트 꺼짐
INSERT INTO server_settings (key, value) VALUES
  ('new_char_exp_pct', '0'),
  ('new_char_exp_until', '')
ON CONFLICT (key) DO NOTHING;
