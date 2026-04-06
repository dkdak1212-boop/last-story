-- 마지막이야기 PostgreSQL 스키마 v0.1
-- Usage: psql -U postgres -d laststory -f schema.sql

BEGIN;

-- 유저 계정
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  username       VARCHAR(20) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  premium_until  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at  TIMESTAMPTZ
);

-- 캐릭터
CREATE TABLE IF NOT EXISTS characters (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(12) UNIQUE NOT NULL,
  class_name      VARCHAR(20) NOT NULL,
  level           INTEGER NOT NULL DEFAULT 1,
  exp             BIGINT  NOT NULL DEFAULT 0,
  gold            BIGINT  NOT NULL DEFAULT 0,
  hp              INTEGER NOT NULL,
  mp              INTEGER NOT NULL,
  max_hp          INTEGER NOT NULL,
  max_mp          INTEGER NOT NULL,
  stats           JSONB   NOT NULL,        -- {str,dex,int,vit,spd,cri}
  location        VARCHAR(64) NOT NULL DEFAULT 'village',  -- 'village' | 'field:<id>'
  last_online_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);

-- 아이템 정의 (정적 데이터)
CREATE TABLE IF NOT EXISTS items (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(40) NOT NULL,
  type         VARCHAR(20) NOT NULL,       -- weapon|armor|accessory|consumable|material
  grade        VARCHAR(20) NOT NULL,       -- common|rare|epic|legendary
  slot         VARCHAR(20),                -- weapon|helm|chest|legs|boots|ring|amulet
  stats        JSONB,
  description  TEXT NOT NULL DEFAULT '',
  stack_size   INTEGER NOT NULL DEFAULT 1,
  sell_price   INTEGER NOT NULL DEFAULT 0
);

-- 캐릭터 인벤토리
CREATE TABLE IF NOT EXISTS character_inventory (
  id            SERIAL PRIMARY KEY,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id       INTEGER NOT NULL REFERENCES items(id),
  slot_index    INTEGER NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  UNIQUE(character_id, slot_index)
);
CREATE INDEX IF NOT EXISTS idx_inv_char ON character_inventory(character_id);

-- 캐릭터 장착 장비
CREATE TABLE IF NOT EXISTS character_equipped (
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  slot          VARCHAR(20) NOT NULL,      -- weapon|helm|chest|legs|boots|ring|amulet
  item_id       INTEGER NOT NULL REFERENCES items(id),
  PRIMARY KEY (character_id, slot)
);

-- 몬스터 정의
CREATE TABLE IF NOT EXISTS monsters (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(40) NOT NULL,
  level         INTEGER NOT NULL,
  max_hp        INTEGER NOT NULL,
  exp_reward    INTEGER NOT NULL,
  gold_reward   INTEGER NOT NULL,
  stats         JSONB NOT NULL,
  drop_table    JSONB NOT NULL DEFAULT '[]'::jsonb,
  avg_kill_time_sec NUMERIC(6,2) NOT NULL DEFAULT 10.0   -- 오프라인 정산용
);

-- 필드 정의
CREATE TABLE IF NOT EXISTS fields (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(40) NOT NULL,
  required_level  INTEGER NOT NULL DEFAULT 1,
  monster_pool    JSONB NOT NULL,          -- [monster_id, ...]
  description     TEXT NOT NULL DEFAULT ''
);

-- 스킬 정의
CREATE TABLE IF NOT EXISTS skills (
  id            SERIAL PRIMARY KEY,
  class_name    VARCHAR(20) NOT NULL,
  name          VARCHAR(40) NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  required_level INTEGER NOT NULL DEFAULT 1,
  cooldown_sec  NUMERIC(5,2) NOT NULL DEFAULT 5,
  mp_cost       INTEGER NOT NULL DEFAULT 0,
  damage_mult   NUMERIC(5,2) NOT NULL DEFAULT 1.0,   -- 기본 공격력 배율
  kind          VARCHAR(20) NOT NULL DEFAULT 'damage',  -- damage|heal|buff|debuff
  target        VARCHAR(20) NOT NULL DEFAULT 'enemy'    -- self|enemy|ally|all_enemies
);

-- 캐릭터가 학습한 스킬 & 자동사용 토글
CREATE TABLE IF NOT EXISTS character_skills (
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  skill_id      INTEGER NOT NULL REFERENCES skills(id),
  auto_use      BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (character_id, skill_id)
);

-- 상점 판매 목록
CREATE TABLE IF NOT EXISTS shop_entries (
  id          SERIAL PRIMARY KEY,
  item_id     INTEGER NOT NULL REFERENCES items(id),
  buy_price   INTEGER NOT NULL,
  stock       INTEGER NOT NULL DEFAULT -1    -- -1 = 무제한
);

-- 우편함 (인벤토리 오버플로우 수납)
CREATE TABLE IF NOT EXISTS mailbox (
  id            SERIAL PRIMARY KEY,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  subject       VARCHAR(80) NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  item_id       INTEGER REFERENCES items(id),
  item_quantity INTEGER,
  gold          BIGINT DEFAULT 0,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);
CREATE INDEX IF NOT EXISTS idx_mailbox_char ON mailbox(character_id, read_at);

-- 오프라인 정산 리포트 이력 (로그용)
CREATE TABLE IF NOT EXISTS offline_reports (
  id              SERIAL PRIMARY KEY,
  character_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  minutes_accounted INTEGER NOT NULL,
  efficiency      NUMERIC(4,2) NOT NULL,
  kill_count      INTEGER NOT NULL,
  exp_gained      BIGINT NOT NULL,
  gold_gained     BIGINT NOT NULL,
  items_dropped   JSONB NOT NULL,
  levels_gained   INTEGER NOT NULL,
  overflow        INTEGER NOT NULL,
  delivered       BOOLEAN NOT NULL DEFAULT FALSE
);

-- 전투 세션 (활성 필드 진입 시 1개)
CREATE TABLE IF NOT EXISTS combat_sessions (
  character_id  INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  field_id      INTEGER NOT NULL REFERENCES fields(id),
  monster_id    INTEGER REFERENCES monsters(id),
  monster_hp    INTEGER NOT NULL DEFAULT 0,
  monster_max_hp INTEGER NOT NULL DEFAULT 0,
  monster_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  player_hp     INTEGER NOT NULL,
  player_mp     INTEGER NOT NULL,
  player_stats  JSONB NOT NULL DEFAULT '{}'::jsonb,
  skill_cooldowns JSONB NOT NULL DEFAULT '{}'::jsonb,
  log           JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_player_action_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_monster_action_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
