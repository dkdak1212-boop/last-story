-- 길드 보스 시스템 Phase 1
-- 요일제 7종 보스, 입장키 일일 2개, 데미지 컷 기반 상자 보상

-- ===== 보스 정의 =====
CREATE TABLE IF NOT EXISTS guild_bosses (
  id SERIAL PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE,
  weekday INT NOT NULL,  -- 0=월 ~ 6=일 (KST 기준)
  description TEXT NOT NULL DEFAULT '',
  appearance TEXT NOT NULL DEFAULT '',
  base_def INT NOT NULL DEFAULT 0,
  base_mdef INT NOT NULL DEFAULT 0,
  base_dodge INT NOT NULL DEFAULT 0,
  base_atk INT NOT NULL DEFAULT 1000,
  element_immune VARCHAR(20),
  element_weak VARCHAR(20),
  weak_amp_pct INT NOT NULL DEFAULT 0,
  dot_immune BOOLEAN NOT NULL DEFAULT FALSE,
  hp_recover_pct INT NOT NULL DEFAULT 0,
  hp_recover_interval_sec INT NOT NULL DEFAULT 0,
  random_weakness BOOLEAN NOT NULL DEFAULT FALSE,
  alternating_immune BOOLEAN NOT NULL DEFAULT FALSE
);

-- ===== 캐릭터 일일 키 / 누적 데미지 =====
CREATE TABLE IF NOT EXISTS guild_boss_daily (
  character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  keys_remaining INT NOT NULL DEFAULT 2,
  daily_damage_total BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, date)
);

-- ===== 입장 기록 (1회 입장 = 1행) =====
CREATE TABLE IF NOT EXISTS guild_boss_runs (
  id BIGSERIAL PRIMARY KEY,
  character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  guild_id INT REFERENCES guilds(id) ON DELETE SET NULL,
  boss_id INT NOT NULL REFERENCES guild_bosses(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  total_damage BIGINT NOT NULL DEFAULT 0,
  reward_tier VARCHAR(10), -- 'gold' | 'silver' | 'copper' | NULL
  thresholds_passed INT NOT NULL DEFAULT 0, -- bitmask: 1=1억, 2=5억, 4=10억
  ended_reason VARCHAR(20) -- 'exit' | 'death' | 'logout' | NULL
);
CREATE INDEX IF NOT EXISTS idx_guild_boss_runs_char_date ON guild_boss_runs(character_id, started_at);
CREATE INDEX IF NOT EXISTS idx_guild_boss_runs_guild_date ON guild_boss_runs(guild_id, started_at);

-- ===== 길드 일일 누적 =====
CREATE TABLE IF NOT EXISTS guild_boss_guild_daily (
  guild_id INT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_damage BIGINT NOT NULL DEFAULT 0,
  global_chest_milestones INT NOT NULL DEFAULT 0, -- bitmask: 1=100억, 2=500억, 4=1000억, 8=5000억
  PRIMARY KEY (guild_id, date)
);

-- ===== 메달 보유 =====
ALTER TABLE characters ADD COLUMN IF NOT EXISTS guild_boss_medals INT NOT NULL DEFAULT 0;

-- ===== 보스 시드 데이터 (7종) =====
INSERT INTO guild_bosses (name, weekday, description, appearance, base_def, base_mdef, base_dodge, base_atk, element_immune, element_weak, weak_amp_pct, dot_immune, hp_recover_pct, hp_recover_interval_sec, random_weakness, alternating_immune) VALUES
('강철의 거인',     0, 'DEF 매우 높음 / MDEF 보통. 방관 또는 마법 빌드 유리',                   '풀플레이트 거인, 양손 도끼',    8000, 2000, 0,   1500, NULL,   NULL,       0,  FALSE, 0, 0, FALSE, FALSE),
('광속의 환영',     1, '회피율 매우 높음 (50퍼센트). 명중 빌드 유리',                            '반투명 그림자, 빠른 잔상',     2000, 2000, 50,  1200, NULL,   NULL,       0,  FALSE, 0, 0, FALSE, FALSE),
('화염의 군주',     2, '화염 면역, 빙결 약점 (+50퍼센트)',                                      '용암 기반 마왕',              3000, 3000, 0,   1400, 'fire', 'frost',    50, FALSE, 0, 0, FALSE, FALSE),
('그림자 황제',     3, '모든 도트 면역. 직타 빌드 유리',                                        '어둠 망토 왕좌',              3000, 3000, 10,  1300, NULL,   NULL,       0,  TRUE,  0, 0, FALSE, FALSE),
('시계태엽 거인',   4, '60초마다 누적 데미지의 30퍼센트 회복. 폭딜 빌드 유리',                   '거대한 시계 메커니즘 골렘',    4000, 4000, 0,   1400, NULL,   NULL,       0,  FALSE, 30, 60, FALSE, FALSE),
('천공의 용',       5, '매 입장 시 약점 원소 랜덤 (+50퍼센트)',                                  '거대한 다색 용',              3500, 3500, 5,   1600, NULL,   NULL,       50, FALSE, 0, 0, TRUE,  FALSE),
('차원의 지배자',   6, '30초 주기로 ATK 면역 / MATK 면역 페이즈 교대',                           '변형하는 보이드',             4000, 4000, 0,   1800, NULL,   NULL,       0,  FALSE, 0, 0, FALSE, TRUE)
ON CONFLICT (name) DO NOTHING;
