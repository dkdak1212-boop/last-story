-- v0.3: 길드 / 파티 / 경매소
BEGIN;

-- 길드
CREATE TABLE IF NOT EXISTS guilds (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(20) UNIQUE NOT NULL,
  description VARCHAR(200) NOT NULL DEFAULT '',
  leader_id   INTEGER NOT NULL REFERENCES characters(id),
  max_members INTEGER NOT NULL DEFAULT 50,
  stat_buff_pct NUMERIC(4,1) NOT NULL DEFAULT 5.0,  -- +5% all stats
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guild_members (
  guild_id     INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  role         VARCHAR(20) NOT NULL DEFAULT 'member',  -- leader|officer|member
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (character_id)    -- 1인 1길드
);
CREATE INDEX IF NOT EXISTS idx_guild_members_guild ON guild_members(guild_id);

-- 파티
CREATE TABLE IF NOT EXISTS parties (
  id         SERIAL PRIMARY KEY,
  leader_id  INTEGER NOT NULL REFERENCES characters(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS party_members (
  party_id     INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (character_id)    -- 1인 1파티
);
CREATE INDEX IF NOT EXISTS idx_party_members_party ON party_members(party_id);

-- 파티 초대장
CREATE TABLE IF NOT EXISTS party_invites (
  id         SERIAL PRIMARY KEY,
  party_id   INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  from_id    INTEGER NOT NULL REFERENCES characters(id),
  to_id      INTEGER NOT NULL REFERENCES characters(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (party_id, to_id)
);
CREATE INDEX IF NOT EXISTS idx_party_invites_to ON party_invites(to_id);

-- 경매소
CREATE TABLE IF NOT EXISTS auctions (
  id                SERIAL PRIMARY KEY,
  seller_id         INTEGER NOT NULL REFERENCES characters(id),
  item_id           INTEGER NOT NULL REFERENCES items(id),
  item_quantity     INTEGER NOT NULL DEFAULT 1,
  start_price       BIGINT NOT NULL,
  buyout_price      BIGINT,                -- nullable
  current_bid       BIGINT,
  current_bidder_id INTEGER REFERENCES characters(id),
  ends_at           TIMESTAMPTZ NOT NULL,
  settled           BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auctions_open ON auctions(ends_at) WHERE settled = FALSE AND cancelled = FALSE;
CREATE INDEX IF NOT EXISTS idx_auctions_seller ON auctions(seller_id);

-- 채팅 확장: 길드/파티 채널 범위
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS scope_id INTEGER;

COMMIT;
