-- 길드 보스 v2: 주간 결산 + 메달 상점
-- 2026-04-18

-- ========================================================
-- 1. 임시 호칭 컬럼 (왕좌 호칭 7일 오버레이용)
-- ========================================================
ALTER TABLE characters ADD COLUMN IF NOT EXISTS transient_title TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS transient_title_expires_at TIMESTAMPTZ;

-- ========================================================
-- 2. 주간 결산 기록
-- ========================================================
CREATE TABLE IF NOT EXISTS guild_boss_weekly_settlements (
  id SERIAL PRIMARY KEY,
  week_ending DATE NOT NULL UNIQUE,      -- 그 주 일요일(KST) 날짜
  rankings JSONB NOT NULL,               -- [{guild_id, name, total_damage, rank, members_count}, ...]
  settled_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================
-- 3. 메달 상점
-- ========================================================
CREATE TABLE IF NOT EXISTS guild_boss_shop_items (
  id SERIAL PRIMARY KEY,
  section VARCHAR(20) NOT NULL,                     -- 'large' | 'medium' | 'small' | 'guild'
  name VARCHAR(80) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price INT NOT NULL,
  limit_scope VARCHAR(20),                          -- 'daily' | 'weekly' | 'monthly' | 'account_total' | NULL
  limit_count INT NOT NULL DEFAULT 0,               -- 0 = 무제한
  reward_type VARCHAR(30) NOT NULL,                 -- 'item' | 'gold' | 'exp_pct_of_level' | 'storage_slot' | 'title_permanent' | 'title_permanent_if_not_expired' | 'boosters_package' | 'guild_exp' | 'item_choice'
  reward_payload JSONB NOT NULL,                    -- {itemId, qty} | {gold} | ...
  sort_order INT NOT NULL DEFAULT 0,
  leader_only BOOLEAN NOT NULL DEFAULT FALSE,       -- 길드장 전용
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS guild_boss_shop_purchases (
  id BIGSERIAL PRIMARY KEY,
  character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  shop_item_id INT NOT NULL REFERENCES guild_boss_shop_items(id),
  scope_key VARCHAR(40) NOT NULL,                   -- 'daily:2026-04-18' | 'weekly:2026-W16' | 'monthly:2026-04' | 'total'
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gbshop_purch_char_item_scope
  ON guild_boss_shop_purchases(character_id, shop_item_id, scope_key);

-- ========================================================
-- 4. 상품 시드 (idempotent — name + section unique 처리)
-- ========================================================
-- 아이템 ID 주석:
--   286 = 강화 성공률 스크롤
--   322 = 접두사 수치 재굴림권
--   476 = 품질 재굴림권
--   477 = 유니크 무작위 추첨권
--   104 = 고급 HP 포션

CREATE UNIQUE INDEX IF NOT EXISTS idx_gbshop_items_section_name
  ON guild_boss_shop_items(section, name);

-- 대형
INSERT INTO guild_boss_shop_items (section, name, description, price, limit_scope, limit_count, reward_type, reward_payload, sort_order, leader_only)
VALUES
  ('large', '유니크 무작위 추첨권', '캐릭 레벨 ±10 풀에서 무작위 유니크 1개 추첨', 8000, 'weekly', 1, 'item', '{"itemId": 477, "qty": 1}'::jsonb, 10, FALSE),
  ('large', '창고 슬롯 영구 +3', '계정 창고 슬롯 영구 +3 (계정 전역)', 10000, 'account_total', 5, 'storage_slot', '{"amount": 3}'::jsonb, 20, FALSE),
  ('large', '길드영웅 호칭 영구 부여', '영구 호칭 "길드영웅" 획득', 7000, 'account_total', 1, 'title_permanent', '{"title": "길드영웅"}'::jsonb, 30, FALSE)
ON CONFLICT (section, name) DO NOTHING;

-- 중형
INSERT INTO guild_boss_shop_items (section, name, description, price, limit_scope, limit_count, reward_type, reward_payload, sort_order, leader_only)
VALUES
  ('medium', '접두사 수치 재굴림권', '장비 접두사 수치 재굴림 1회권', 1200, 'weekly', 3, 'item', '{"itemId": 322, "qty": 1}'::jsonb, 10, FALSE),
  ('medium', '강화 성공 스크롤', '강화 100% 성공 스크롤 1회권', 800, 'weekly', 5, 'item', '{"itemId": 286, "qty": 1}'::jsonb, 20, FALSE),
  ('medium', '부스터 6시간 패키지', 'EXP/골드/드랍/공격력/HP 5종 +50% 6시간 동시 부스트', 3000, 'weekly', 5, 'boosters_package', '{"durationMin": 360}'::jsonb, 30, FALSE)
ON CONFLICT (section, name) DO NOTHING;

-- 소형
INSERT INTO guild_boss_shop_items (section, name, description, price, limit_scope, limit_count, reward_type, reward_payload, sort_order, leader_only)
VALUES
  ('small', '골드 묶음 (100만)', '즉시 골드 +1,000,000', 100, 'daily', 3, 'gold', '{"amount": 1000000}'::jsonb, 10, FALSE),
  ('small', '고급 HP 포션 10개', '고급 HP 포션 10개 즉시 지급', 50, 'daily', 5, 'item', '{"itemId": 104, "qty": 10}'::jsonb, 20, FALSE),
  ('small', 'EXP 두루마리 (현 레벨 1%)', '현재 레벨 요구 경험치의 1% 즉시 지급', 200, 'daily', 2, 'exp_pct_of_level', '{"pct": 1}'::jsonb, 30, FALSE)
ON CONFLICT (section, name) DO NOTHING;

-- 길드 단위 (길드장만)
INSERT INTO guild_boss_shop_items (section, name, description, price, limit_scope, limit_count, reward_type, reward_payload, sort_order, leader_only)
VALUES
  ('guild', '길드 명성 +1,000', '소속 길드 경험치 +1,000 즉시 지급 (길드 레벨업 가속)', 2000, 'weekly', 2, 'guild_exp', '{"amount": 1000}'::jsonb, 10, TRUE)
ON CONFLICT (section, name) DO NOTHING;
