-- v0.9 시스템 리뉴얼 마이그레이션
-- 직업 4개, MP 제거, 게이지 전투, 노드 트리, 파티 삭제

BEGIN;

-- ============================================================
-- 1. 캐릭터 전체 와이프 (유저 계정은 유지)
-- ============================================================
TRUNCATE characters CASCADE;

-- ============================================================
-- 2. 파티 시스템 삭제
-- ============================================================
DROP TABLE IF EXISTS party_members CASCADE;
DROP TABLE IF EXISTS parties CASCADE;

-- ============================================================
-- 3. characters 테이블 변경 — MP 제거, node_points 추가
-- ============================================================
ALTER TABLE characters DROP COLUMN IF EXISTS mp;
ALTER TABLE characters DROP COLUMN IF EXISTS max_mp;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS node_points INT NOT NULL DEFAULT 0;

-- class_name을 4직업으로 제한 (기존 CHECK 제거 후 새로 추가)
ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_class_name_check;
ALTER TABLE characters ADD CONSTRAINT characters_class_name_check
  CHECK (class_name IN ('warrior', 'mage', 'cleric', 'rogue'));

-- ============================================================
-- 4. combat_sessions 테이블 재구성 — 게이지 기반
-- ============================================================
DROP TABLE IF EXISTS combat_sessions;
CREATE TABLE combat_sessions (
  character_id   INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  field_id       INTEGER NOT NULL REFERENCES fields(id),
  monster_id     INTEGER REFERENCES monsters(id),
  monster_hp     INTEGER NOT NULL DEFAULT 0,
  monster_max_hp INTEGER NOT NULL DEFAULT 0,
  monster_speed  INTEGER NOT NULL DEFAULT 100,
  monster_gauge  INTEGER NOT NULL DEFAULT 0,
  player_hp      INTEGER NOT NULL,
  player_gauge   INTEGER NOT NULL DEFAULT 0,
  player_speed   INTEGER NOT NULL DEFAULT 300,
  auto_mode      BOOLEAN NOT NULL DEFAULT TRUE,
  waiting_input  BOOLEAN NOT NULL DEFAULT FALSE,
  skill_cooldowns JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { skillId: remainingActions }
  status_effects  JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ type, value, remaining, target }]
  action_count   INTEGER NOT NULL DEFAULT 0,            -- 플레이어 총 행동 횟수
  combat_log     JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. skills 테이블 재구성 — MP 제거, 쿨타임=행동횟수
-- ============================================================
TRUNCATE skills CASCADE;
ALTER TABLE skills DROP COLUMN IF EXISTS mp_cost;
ALTER TABLE skills DROP COLUMN IF EXISTS cooldown_sec;
ALTER TABLE skills DROP COLUMN IF EXISTS target;

-- 새 컬럼 추가 (있으면 스킵)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS cooldown_actions INT NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS flat_damage INT NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS effect_type VARCHAR(30) NOT NULL DEFAULT 'damage';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS effect_value NUMERIC(8,2) NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS effect_duration INT NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS icon VARCHAR(80) NOT NULL DEFAULT '';

-- ============================================================
-- 6. 28개 스킬 시드
-- ============================================================

-- 전사 (warrior)
INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration) VALUES
('warrior', '강타',         'ATK x150%',                                       1,  1.50, 'damage', 0, 0, 'damage', 0, 0),
('warrior', '분노의 일격',  'ATK x220%, 자신 HP 5% 소모',                      5,  2.20, 'damage', 3, 0, 'self_damage_pct', 5, 0),
('warrior', '철벽',         '2행동간 받는 데미지 30% 감소 실드',               10, 0.00, 'buff',   4, 0, 'damage_reduce', 30, 2),
('warrior', '흡혈 참격',    'ATK x180%, 데미지의 40% HP 흡수',                 15, 1.80, 'damage', 4, 0, 'lifesteal', 40, 0),
('warrior', '반격의 의지',  '피격 데미지 50% 반사, 2행동 지속',                20, 0.00, 'buff',   6, 0, 'damage_reflect', 50, 2),
('warrior', '무쌍난무',     'ATK x120% x3회 연속 타격',                        25, 1.20, 'damage', 5, 0, 'multi_hit', 3, 0),
('warrior', '불굴',         'HP 1로 버팀, 1행동간 무적',                       30, 0.00, 'buff',   8, 0, 'invincible', 1, 1);

-- 마법사 (mage)
INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration) VALUES
('mage', '화염구',       'ATK x140% + 30, 화상 도트 2행동',                    1,  1.40, 'damage', 0, 30, 'dot', 0, 2),
('mage', '냉기 창',      'ATK x160%, 적 스피드 30% 감소 2행동',               5,  1.60, 'damage', 3, 0,  'speed_mod', -30, 2),
('mage', '게이지 폭발',  '적 게이지 0 리셋, 50% 확률 1행동 조작불능',         10, 0.00, 'debuff', 5, 0,  'gauge_reset', 50, 1),
('mage', '번개 사슬',    'ATK x200% + 50, 스턴 1행동',                        15, 2.00, 'damage', 4, 50, 'stun', 0, 1),
('mage', '빙결 감옥',    '적 게이지 충전 정지 2행동',                         20, 0.00, 'debuff', 6, 0,  'gauge_freeze', 0, 2),
('mage', '유성 낙하',    'ATK x280% + 80, 화상 도트 3행동',                   25, 2.80, 'damage', 6, 80, 'dot', 0, 3),
('mage', '마력 과부하',  'ATK x350%, 시전 후 자신 스피드 50% 감소 2행동',     30, 3.50, 'damage', 8, 0,  'self_speed_mod', -50, 2);

-- 성직자 (cleric)
INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration) VALUES
('cleric', '신성 방벽',    '최대 HP 20% 실드, 3행동 지속',                      1,  0.00, 'buff',   0, 0,  'shield', 20, 3),
('cleric', '심판의 철퇴',  'ATK x170% + 40, 적 실드 파괴',                     5,  1.70, 'damage', 3, 40, 'shield_break', 0, 0),
('cleric', '치유의 빛',    '최대 HP 25% 즉시 회복',                            10, 0.00, 'heal',   4, 0,  'heal_pct', 25, 0),
('cleric', '신성 화염',    'ATK x190%, 신성 도트 3행동',                       15, 1.90, 'damage', 4, 0,  'dot', 0, 3),
('cleric', '신의 가호',    '2행동간 받는 데미지 완전 반사',                    20, 0.00, 'buff',   7, 0,  'damage_reflect', 100, 2),
('cleric', '천벌',         'ATK x260%, 적 스피드 40% 감소 2행동',             25, 2.60, 'damage', 6, 0,  'speed_mod', -40, 2),
('cleric', '부활의 기적',  'HP 0 시 HP 50% 자동 회복 1회',                    30, 0.00, 'buff',  10, 0,  'resurrect', 50, 1);

-- 도적 (rogue)
INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration) VALUES
('rogue', '급소 찌르기',  'ATK x160%, 치명타 확률 +20%',                       1,  1.60, 'damage', 0, 0,  'crit_bonus', 20, 0),
('rogue', '독 투척',      'ATK x100% + 독 도트 4행동, 적 스피드 20% 감소',    5,  1.00, 'damage', 3, 0,  'poison', 20, 4),
('rogue', '백스텝',       '자신 게이지 즉시 1000 충전 (연속행동)',             10, 0.00, 'buff',   5, 0,  'gauge_fill', 1000, 0),
('rogue', '연막탄',       '적 게이지 50% 감소, 명중률 30% 감소 2행동',        15, 0.00, 'debuff', 4, 0,  'accuracy_debuff', 30, 2),
('rogue', '맹독 강화',    '현재 독 도트 데미지 즉시 200% 폭발',               20, 0.00, 'damage', 5, 0,  'poison_burst', 200, 0),
('rogue', '그림자 연격',  'ATK x130% x4회, 각 타격마다 독 중첩',              25, 1.30, 'damage', 6, 0,  'multi_hit_poison', 4, 0),
('rogue', '사신의 낫',    'ATK x300% + 적 현재 HP 10% 고정 데미지',           30, 3.00, 'damage', 8, 0,  'hp_pct_damage', 10, 0);

-- ============================================================
-- 7. 노드 트리 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS node_definitions (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(50) NOT NULL,
  description     TEXT NOT NULL,
  zone            VARCHAR(30) NOT NULL,          -- center, south, east, west, north_warrior, north_mage, north_cleric, north_rogue
  tier            VARCHAR(10) NOT NULL,          -- small, medium, large
  cost            INT NOT NULL,                  -- 1, 2, or 4
  class_exclusive VARCHAR(20),                   -- NULL=공용
  effects         JSONB NOT NULL,                -- [{ type: 'stat'|'passive', stat?, key?, value }]
  prerequisites   INT[] DEFAULT '{}',            -- 선행 노드 ID 배열
  position_x      INT NOT NULL DEFAULT 0,
  position_y      INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS character_nodes (
  character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  node_id      INT NOT NULL REFERENCES node_definitions(id),
  invested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (character_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_char_nodes ON character_nodes(character_id);

-- ============================================================
-- 8. 몬스터 스피드 스케일 조정 (기존 90~140 → 게이지 시스템 범위)
-- ============================================================
UPDATE monsters SET stats = jsonb_set(stats, '{spd}',
  to_jsonb(GREATEST(50, LEAST(1200,
    CASE
      WHEN level <= 10 THEN 50 + level * 5                     -- 50~100
      WHEN level <= 30 THEN 100 + (level - 10) * 7             -- 100~240
      WHEN level <= 50 THEN 240 + (level - 30) * 13            -- 240~500
      WHEN level <= 70 THEN 500 + (level - 50) * 15            -- 500~800
      ELSE 800 + (level - 70) * 13                             -- 800~1200
    END
  )))
);

-- ============================================================
-- 9. 길드전 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS guild_wars (
  id              SERIAL PRIMARY KEY,
  guild_a_id      INT NOT NULL,
  guild_b_id      INT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, in_progress, finished
  winner_guild_id INT,
  guild_a_wins    INT NOT NULL DEFAULT 0,
  guild_b_wins    INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS guild_war_matches (
  id            SERIAL PRIMARY KEY,
  war_id        INT NOT NULL REFERENCES guild_wars(id) ON DELETE CASCADE,
  char_a_id     INT NOT NULL,
  char_b_id     INT NOT NULL,
  winner_id     INT,
  battle_log    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
