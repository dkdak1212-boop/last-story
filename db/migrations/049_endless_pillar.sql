-- 종언의 기둥 (Endless Pillar) — 탑 등반 무한 컨텐츠
-- 인터뷰 결과 기반 (endless-pillar-spec.md 참조)
-- 2026-04-27

-- 1) 캐릭별 진행 상태 (1행 per character)
CREATE TABLE IF NOT EXISTS endless_pillar_progress (
  character_id        INT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  current_floor       INT NOT NULL DEFAULT 1,           -- 현재 진행 층
  current_hp          INT NOT NULL DEFAULT 0,           -- 일시정지/세션 보존용 HP
  paused              BOOLEAN NOT NULL DEFAULT TRUE,    -- 외부 이동/세션 정리 시 TRUE
  highest_floor       INT NOT NULL DEFAULT 0,           -- 역대 최고 도달층
  daily_highest_floor INT NOT NULL DEFAULT 0,           -- 당일 도달 최고층 (자정 cron 으로 0 리셋)
  daily_highest_at    TIMESTAMPTZ,                      -- 당일 최고층 첫 도달 시각 (동점 처리용)
  total_kills         BIGINT NOT NULL DEFAULT 0,        -- 누적 처치 (통계용)
  total_deaths        INT NOT NULL DEFAULT 0,           -- 누적 사망
  last_updated        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_epp_daily ON endless_pillar_progress(daily_highest_floor DESC, daily_highest_at);
CREATE INDEX IF NOT EXISTS idx_epp_highest ON endless_pillar_progress(highest_floor DESC);

-- 2) 층별 클리어 시간 로그 (랭킹 동점 / 통계 / 명예의 전당)
CREATE TABLE IF NOT EXISTS endless_pillar_floor_log (
  id              BIGSERIAL PRIMARY KEY,
  character_id    INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  floor           INT NOT NULL,
  cleared_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clear_time_ms   INT NOT NULL                          -- 해당 층 처치 소요 시간 (ms)
);
CREATE INDEX IF NOT EXISTS idx_epfl_char ON endless_pillar_floor_log(character_id, cleared_at DESC);
CREATE INDEX IF NOT EXISTS idx_epfl_floor ON endless_pillar_floor_log(floor);

-- 3) 일일 랭킹 보상 매핑 — 한 순위(rank)에 복수 아이템 row 가능
CREATE TABLE IF NOT EXISTS endless_pillar_reward_mapping (
  id            SERIAL PRIMARY KEY,
  rank          INT NOT NULL,                           -- 1~100 (보상 받는 순위)
  item_id       INT NOT NULL REFERENCES items(id),
  quantity      INT NOT NULL DEFAULT 1,
  description   TEXT
);
CREATE INDEX IF NOT EXISTS idx_eprm_rank ON endless_pillar_reward_mapping(rank);

-- 4) 일일 보상 발송 로그 (멱등성)
-- 같은 날 같은 캐릭에게 같은 아이템 두번 발송 차단. 단 random_bonus 는 main 과 별개로 인정.
CREATE TABLE IF NOT EXISTS endless_pillar_daily_rewards (
  id              BIGSERIAL PRIMARY KEY,
  send_date       DATE NOT NULL,                        -- KST 기준 날짜
  character_id    INT NOT NULL,
  rank            INT,                                  -- random_bonus 인 경우 NULL 가능
  floor_reached   INT NOT NULL,
  item_id         INT NOT NULL,
  quantity        INT NOT NULL,
  is_random_bonus BOOLEAN NOT NULL DEFAULT FALSE,       -- 200위 안 랜덤 10명 추첨 보너스
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (send_date, character_id, item_id, is_random_bonus)
);
CREATE INDEX IF NOT EXISTS idx_epdr_date ON endless_pillar_daily_rewards(send_date);

-- 5) 보상 매핑 시드
-- T3=840 / T2=856 / T1=857 / 품질 재굴림권=476 / 접두사 수치 재굴림권=322 / 3옵 보장=841
DELETE FROM endless_pillar_reward_mapping;

-- 1~10위: T3 추첨권 + 품질 재굴림권
INSERT INTO endless_pillar_reward_mapping (rank, item_id, quantity, description)
SELECT g, 840, 1, g || '위: T3 보장 추첨권' FROM generate_series(1, 10) AS g;
INSERT INTO endless_pillar_reward_mapping (rank, item_id, quantity, description)
SELECT g, 476, 1, g || '위: 품질 재굴림권' FROM generate_series(1, 10) AS g;

-- 11~50위: T2 추첨권 + 접두사 수치 재굴림권
INSERT INTO endless_pillar_reward_mapping (rank, item_id, quantity, description)
SELECT g, 856, 1, g || '위: T2 보장 추첨권' FROM generate_series(11, 50) AS g;
INSERT INTO endless_pillar_reward_mapping (rank, item_id, quantity, description)
SELECT g, 322, 1, g || '위: 접두사 수치 재굴림권' FROM generate_series(11, 50) AS g;

-- 51~100위: T1 추첨권 + 접두사 수치 재굴림권
INSERT INTO endless_pillar_reward_mapping (rank, item_id, quantity, description)
SELECT g, 857, 1, g || '위: T1 보장 추첨권' FROM generate_series(51, 100) AS g;
INSERT INTO endless_pillar_reward_mapping (rank, item_id, quantity, description)
SELECT g, 322, 1, g || '위: 접두사 수치 재굴림권' FROM generate_series(51, 100) AS g;

-- 6) 종언 사냥터 fields 항목 — id=1000 (어드민 전용 노출, required_level=1)
INSERT INTO fields (id, name, required_level, monster_pool, description)
VALUES (1000, '종언의 기둥', 1, '[]'::jsonb,
        '무한 등반 도전 컨텐츠. 100층마다 보스 등장, 죽으면 1층 회귀. 매일 랭킹 보상 지급.')
ON CONFLICT (id) DO NOTHING;
