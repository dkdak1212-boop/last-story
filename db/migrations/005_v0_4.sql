-- v0.4: PvP + 프리미엄
BEGIN;

-- PvP 스탯
CREATE TABLE IF NOT EXISTS pvp_stats (
  character_id   INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  wins           INTEGER NOT NULL DEFAULT 0,
  losses         INTEGER NOT NULL DEFAULT 0,
  elo            INTEGER NOT NULL DEFAULT 1000,
  daily_attacks  INTEGER NOT NULL DEFAULT 0,
  last_daily_reset DATE NOT NULL DEFAULT CURRENT_DATE
);

-- PvP 전투 기록
CREATE TABLE IF NOT EXISTS pvp_battles (
  id           SERIAL PRIMARY KEY,
  attacker_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  defender_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  winner_id    INTEGER NOT NULL REFERENCES characters(id),
  elo_change   INTEGER NOT NULL,
  log          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pvp_battles_attacker ON pvp_battles(attacker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvp_battles_defender ON pvp_battles(defender_id, created_at DESC);

-- PvP 공격 쿨다운 (동일 상대)
CREATE TABLE IF NOT EXISTS pvp_cooldowns (
  attacker_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  defender_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (attacker_id, defender_id)
);

-- 프리미엄: 캐릭터 추가 필드
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS inventory_slots_bonus INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exp_boost_until TIMESTAMPTZ;

-- 프리미엄: 유저 추가 필드
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS max_character_slots INTEGER NOT NULL DEFAULT 3;

-- 프리미엄 구매 로그
CREATE TABLE IF NOT EXISTS premium_purchases (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id INTEGER REFERENCES characters(id),
  item_code   VARCHAR(40) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
