-- v0.2 마이그레이션: 채팅, 퀘스트 테이블
BEGIN;

-- 채팅 메시지 히스토리
CREATE TABLE IF NOT EXISTS chat_messages (
  id         SERIAL PRIMARY KEY,
  channel    VARCHAR(20) NOT NULL,  -- global|trade
  from_name  VARCHAR(20) NOT NULL,
  text       VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_channel_created ON chat_messages(channel, created_at DESC);

-- 퀘스트 정의 (정적)
CREATE TABLE IF NOT EXISTS quests (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(60) NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  required_level  INTEGER NOT NULL DEFAULT 1,
  target_kind     VARCHAR(20) NOT NULL,     -- monster
  target_id       INTEGER NOT NULL,
  target_count    INTEGER NOT NULL,
  reward_exp      INTEGER NOT NULL DEFAULT 0,
  reward_gold     INTEGER NOT NULL DEFAULT 0,
  reward_item_id  INTEGER REFERENCES items(id),
  reward_item_qty INTEGER DEFAULT 0
);

-- 캐릭터별 퀘스트 진행
CREATE TABLE IF NOT EXISTS character_quests (
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  quest_id      INTEGER NOT NULL REFERENCES quests(id),
  progress      INTEGER NOT NULL DEFAULT 0,
  completed     BOOLEAN NOT NULL DEFAULT FALSE,
  claimed       BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (character_id, quest_id)
);
CREATE INDEX IF NOT EXISTS idx_char_quests_char ON character_quests(character_id);

-- 초기 퀘스트 데이터
INSERT INTO quests (name, description, required_level, target_kind, target_id, target_count, reward_exp, reward_gold, reward_item_id, reward_item_qty) VALUES
('들쥐 퇴치', '초원을 어지럽히는 들쥐 10마리를 처치하라.', 1, 'monster', 1, 10, 100, 50, 100, 3),
('고블린 소탕', '고블린 15마리를 처치하라.', 2, 'monster', 2, 15, 300, 150, 100, 5),
('늑대 사냥꾼', '언덕길의 늑대 20마리를 처치하라.', 3, 'monster', 3, 20, 600, 300, 102, 2),
('거미 박멸', '숲 외곽의 거미 10마리를 처치하라.', 6, 'monster', 10, 10, 1500, 800, 102, 3),
('오크 토벌대', '오크 전사 10마리를 처치하라.', 8, 'monster', 11, 10, 3000, 2000, 103, 3),
('숲의 왕 처치', '깊은 숲의 왕을 쓰러뜨려라.', 12, 'monster', 12, 1, 5000, 3000, 20, 1);

COMMIT;
