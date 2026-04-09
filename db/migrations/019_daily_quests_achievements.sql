-- ═══ 일일 퀘스트 ═══

CREATE TABLE IF NOT EXISTS daily_quest_pool (
  id          SERIAL PRIMARY KEY,
  kind        VARCHAR(30) NOT NULL,
  target_count INTEGER NOT NULL,
  label       VARCHAR(80) NOT NULL
);

INSERT INTO daily_quest_pool (kind, target_count, label) VALUES
  ('kill_monsters', 30, '몬스터 30마리 처치'),
  ('kill_monsters', 60, '몬스터 60마리 처치'),
  ('kill_monsters', 100, '몬스터 100마리 처치'),
  ('use_skills', 20, '스킬 20회 사용'),
  ('use_skills', 50, '스킬 50회 사용'),
  ('earn_gold', 5000, '골드 5,000 획득'),
  ('earn_gold', 20000, '골드 20,000 획득'),
  ('enhance', 1, '장비 강화 1회 시도'),
  ('enhance', 3, '장비 강화 3회 시도'),
  ('pvp_attack', 1, 'PvP 1회 공격')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS character_daily_quests (
  id            SERIAL PRIMARY KEY,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  quest_pool_id INTEGER NOT NULL REFERENCES daily_quest_pool(id),
  kind          VARCHAR(30) NOT NULL,
  target_count  INTEGER NOT NULL,
  progress      INTEGER NOT NULL DEFAULT 0,
  completed     BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_date DATE NOT NULL DEFAULT (CURRENT_DATE AT TIME ZONE 'Asia/Seoul')
);
CREATE INDEX IF NOT EXISTS idx_cdq_char_date ON character_daily_quests(character_id, assigned_date);

CREATE TABLE IF NOT EXISTS daily_quest_rewards (
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  reward_date   DATE NOT NULL,
  claimed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (character_id, reward_date)
);

-- ═══ 업적 ═══

CREATE TABLE IF NOT EXISTS achievements (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(50) UNIQUE NOT NULL,
  name        VARCHAR(60) NOT NULL,
  description TEXT NOT NULL,
  category    VARCHAR(30) NOT NULL,
  condition_kind VARCHAR(30) NOT NULL,
  condition_value INTEGER NOT NULL DEFAULT 1,
  title_reward VARCHAR(30) NOT NULL DEFAULT ''
);

INSERT INTO achievements (code, name, description, category, condition_kind, condition_value, title_reward) VALUES
  ('level_10', '여행의 시작', '레벨 10 달성', 'level', 'level', 10, '초보 모험가'),
  ('level_30', '중급 모험가', '레벨 30 달성', 'level', 'level', 30, '숙련자'),
  ('level_50', '고급 모험가', '레벨 50 달성', 'level', 'level', 50, '베테랑'),
  ('level_70', '전설의 시작', '레벨 70 달성', 'level', 'level', 70, '영웅'),
  ('level_100', '최강자', '레벨 100 달성', 'level', 'level', 100, '전설'),
  ('kill_100', '사냥꾼', '몬스터 100마리 처치', 'combat', 'total_kills', 100, '사냥꾼'),
  ('kill_1000', '학살자', '몬스터 1,000마리 처치', 'combat', 'total_kills', 1000, '학살자'),
  ('kill_10000', '몬스터 헌터', '몬스터 10,000마리 처치', 'combat', 'total_kills', 10000, '몬스터 헌터'),
  ('gold_10k', '동전 수집가', '골드 10,000 획득', 'wealth', 'total_gold_earned', 10000, '부자'),
  ('gold_100k', '금고지기', '골드 100,000 획득', 'wealth', 'total_gold_earned', 100000, '금고지기'),
  ('gold_1m', '재벌', '골드 1,000,000 획득', 'wealth', 'total_gold_earned', 1000000, '재벌'),
  ('enhance_5', '강화 입문', '+5 강화 달성', 'enhance', 'max_enhance', 5, '강화 입문'),
  ('enhance_10', '강화 장인', '+10 강화 달성', 'enhance', 'max_enhance', 10, '강화 장인'),
  ('enhance_15', '강화 마스터', '+15 강화 달성', 'enhance', 'max_enhance', 15, '강화의 달인'),
  ('enhance_20', '강화의 신', '+20 강화 달성', 'enhance', 'max_enhance', 20, '강화의 신'),
  ('pvp_wins_5', 'PvP 승리자', 'PvP 5승 달성', 'pvp', 'pvp_wins', 5, '결투사'),
  ('pvp_wins_20', 'PvP 전사', 'PvP 20승 달성', 'pvp', 'pvp_wins', 20, '투사'),
  ('pvp_wins_50', 'PvP 챔피언', 'PvP 50승 달성', 'pvp', 'pvp_wins', 50, '챔피언'),
  ('pvp_wins_100', 'PvP 전설', 'PvP 100승 달성', 'pvp', 'pvp_wins', 100, '전장의 왕'),
  ('first_login', '마지막이야기', '첫 로그인', 'special', 'first_login', 1, '신입 모험가')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS character_achievements (
  character_id   INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  achievement_id INTEGER NOT NULL REFERENCES achievements(id),
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (character_id, achievement_id)
);

-- 캐릭터 통계 컬럼
ALTER TABLE characters ADD COLUMN IF NOT EXISTS title VARCHAR(30) DEFAULT NULL;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS total_kills BIGINT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS total_gold_earned BIGINT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS max_enhance_level INTEGER NOT NULL DEFAULT 0;
