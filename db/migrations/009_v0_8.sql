-- v0.8: 월드 이벤트 + Lv.50-70 필드 확장 + 아이템 비교
BEGIN;

-- ========== 월드 이벤트 ==========

CREATE TABLE IF NOT EXISTS world_event_bosses (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(60) NOT NULL,
  max_hp         BIGINT NOT NULL,
  level          INTEGER NOT NULL,
  time_limit_sec INTEGER NOT NULL DEFAULT 1800,
  min_level      INTEGER NOT NULL DEFAULT 10,
  reward_table   JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS world_event_active (
  id           SERIAL PRIMARY KEY,
  boss_id      INTEGER NOT NULL REFERENCES world_event_bosses(id),
  current_hp   BIGINT NOT NULL,
  max_hp       BIGINT NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at      TIMESTAMPTZ NOT NULL,
  finished_at  TIMESTAMPTZ,
  status       VARCHAR(20) NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS world_event_participants (
  id             SERIAL PRIMARY KEY,
  event_id       INTEGER NOT NULL REFERENCES world_event_active(id) ON DELETE CASCADE,
  character_id   INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  total_damage   BIGINT NOT NULL DEFAULT 0,
  attack_count   INTEGER NOT NULL DEFAULT 0,
  last_attack_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, character_id)
);
CREATE INDEX IF NOT EXISTS idx_wep_event ON world_event_participants(event_id);

CREATE TABLE IF NOT EXISTS world_event_schedule (
  id       SERIAL PRIMARY KEY,
  boss_id  INTEGER NOT NULL REFERENCES world_event_bosses(id),
  hour_utc INTEGER NOT NULL,
  enabled  BOOLEAN NOT NULL DEFAULT TRUE
);

-- 월드 보스 시드
INSERT INTO world_event_bosses (id, name, max_hp, level, time_limit_sec, min_level, reward_table) VALUES
(1, '태고의 용왕 발라카스', 5000000, 80, 1800, 10,
  '[
    {"tier":"S","minRank":1,"maxRank":3,"rewards":{"itemId":350,"qty":1,"gold":50000,"exp":500000}},
    {"tier":"A","minPct":0,"maxPct":5,"rewards":{"itemId":349,"qty":1,"gold":30000,"exp":300000}},
    {"tier":"B","minPct":5,"maxPct":20,"rewards":{"itemId":348,"qty":1,"gold":15000,"exp":150000}},
    {"tier":"C","minPct":20,"maxPct":100,"rewards":{"gold":5000,"exp":50000}}
  ]'::jsonb);

INSERT INTO world_event_schedule (boss_id, hour_utc) VALUES
(1, 0), (1, 6), (1, 12), (1, 18);

-- ========== Lv.50-70 장비 ==========

INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
-- STR 무기
(300, '파멸의 대검',       'weapon','epic','weapon','{"str":38,"vit":10,"cri":6}',      '파괴의 힘이 응축된 대검', 1, 2800),
(301, '폭풍의 전투도끼',   'weapon','epic','weapon','{"str":44,"vit":8,"cri":8}',       '폭풍을 일으키는 도끼', 1, 3200),
(302, '천벌의 대검',       'weapon','legendary','weapon','{"str":62,"vit":18,"cri":10}', '신이 내린 벌의 검', 1, 8500),
(303, '멸망의 도끼',       'weapon','legendary','weapon','{"str":72,"vit":14,"cri":14}', '세계를 멸망시킬 도끼', 1, 9800),
-- DEX 무기
(310, '독사의 쌍검',       'weapon','epic','weapon','{"dex":36,"cri":14,"spd":6}',      '맹독을 품은 쌍검', 1, 2900),
(311, '질풍의 장궁',       'weapon','epic','weapon','{"dex":40,"cri":12,"spd":8}',      '질풍처럼 쏘아진다', 1, 3100),
(312, '사신의 단검',       'weapon','legendary','weapon','{"dex":60,"cri":22,"spd":12}', '사신이 쥐던 단검', 1, 8800),
(313, '폭풍의 활',         'weapon','legendary','weapon','{"dex":66,"cri":18,"spd":16}', '폭풍을 날린다', 1, 9500),
-- INT 무기
(320, '심판의 지팡이',     'weapon','epic','weapon','{"int":40,"vit":8,"cri":4}',       '심판을 내리는 지팡이', 1, 3000),
(321, '혼돈의 오브',       'weapon','epic','weapon','{"int":44,"vit":6,"cri":6}',       '혼돈의 마력이 소용돌이친다', 1, 3300),
(322, '세계수의 지팡이',   'weapon','legendary','weapon','{"int":68,"vit":16,"cri":8}',  '세계수의 생명력', 1, 9000),
(323, '종말의 홀',         'weapon','legendary','weapon','{"int":64,"vit":22,"cri":6}',  '종말을 고하는 홀', 1, 8600),
-- 방어구
(330, '파멸의 투구',       'armor','epic','helm','{"vit":28,"str":8,"cri":4}',          '파멸의 힘이 깃든 투구', 1, 1800),
(331, '종말의 왕관',       'armor','legendary','helm','{"vit":42,"str":12,"int":12,"cri":6}', '종말의 힘이 깃든 왕관', 1, 5500),
(332, '파멸의 갑주',       'armor','epic','chest','{"vit":40,"str":12,"dex":6}',        '파멸의 전사 갑주', 1, 2200),
(333, '종말의 갑주',       'armor','legendary','chest','{"vit":60,"str":16,"int":16}',  '종말의 전사 갑주', 1, 8000),
(336, '파멸의 장화',       'armor','epic','boots','{"vit":20,"dex":12,"spd":16}',       '파멸의 장화', 1, 1500),
(337, '종말의 장화',       'armor','legendary','boots','{"vit":32,"dex":20,"spd":24}',  '종말의 발걸음', 1, 5800),
-- 장신구
(340, '파멸의 반지',       'accessory','epic','ring','{"str":14,"vit":10,"cri":8}',     '파멸의 힘을 품은 반지', 1, 1400),
(341, '종말의 반지',       'accessory','legendary','ring','{"str":22,"dex":22,"int":22,"vit":12,"cri":12}', '종말의 반지', 1, 6200),
(342, '파멸의 목걸이',     'accessory','epic','amulet','{"vit":24,"str":8,"int":8}',    '파멸의 보호', 1, 1500),
(343, '종말의 목걸이',     'accessory','legendary','amulet','{"vit":40,"str":16,"int":16,"dex":16,"cri":8}', '종말의 목걸이', 1, 6500),
-- 월드이벤트 보상 재료
(348, '발라카스의 비늘',   'material','epic',NULL,NULL,      '태고 용왕의 비늘. 교환 재료.', 99, 2000),
(349, '용왕의 결정',       'material','legendary',NULL,NULL, '태고 용왕의 결정. 희귀 교환 재료.', 99, 5000),
(350, '용왕의 핵',         'material','legendary',NULL,NULL, '태고 용왕의 핵. 최고급 교환 재료.', 99, 15000);

-- ========== Lv.50-70 몬스터 ==========

INSERT INTO monsters (id, name, level, max_hp, exp_reward, gold_reward, stats, drop_table, avg_kill_time_sec) VALUES
(120, '나가 전사',      52, 9200,  2800, 1250,
  '{"str":88,"dex":60,"int":55,"vit":70,"spd":110,"cri":16}'::jsonb,
  '[{"itemId":106,"chance":0.14,"minQty":1,"maxQty":1},{"itemId":300,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":330,"chance":0.04,"minQty":1,"maxQty":1}]'::jsonb, 52),
(121, '트롤 광전사',    54, 10500, 3200, 1400,
  '{"str":98,"dex":42,"int":20,"vit":85,"spd":95,"cri":12}'::jsonb,
  '[{"itemId":106,"chance":0.15,"minQty":1,"maxQty":2},{"itemId":301,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":332,"chance":0.04,"minQty":1,"maxQty":1}]'::jsonb, 55),
(122, '그리폰',        56, 11800, 3600, 1600,
  '{"str":92,"dex":75,"int":35,"vit":72,"spd":140,"cri":18}'::jsonb,
  '[{"itemId":107,"chance":0.10,"minQty":1,"maxQty":1},{"itemId":310,"chance":0.04,"minQty":1,"maxQty":1}]'::jsonb, 58),
(123, '가고일',        58, 13200, 4100, 1800,
  '{"str":100,"dex":50,"int":60,"vit":90,"spd":100,"cri":14}'::jsonb,
  '[{"itemId":107,"chance":0.12,"minQty":1,"maxQty":1},{"itemId":320,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":340,"chance":0.05,"minQty":1,"maxQty":1}]'::jsonb, 62),
(130, '보스: 히드라',   60, 35000, 8500, 5500,
  '{"str":135,"dex":90,"int":70,"vit":120,"spd":120,"cri":20}'::jsonb,
  '[{"itemId":107,"chance":0.80,"minQty":2,"maxQty":4},{"itemId":302,"chance":0.12,"minQty":1,"maxQty":1},{"itemId":312,"chance":0.12,"minQty":1,"maxQty":1},{"itemId":322,"chance":0.12,"minQty":1,"maxQty":1},{"itemId":331,"chance":0.08,"minQty":1,"maxQty":1},{"itemId":333,"chance":0.06,"minQty":1,"maxQty":1}]'::jsonb, 200),
(124, '망자의 기사',    62, 15000, 4800, 2100,
  '{"str":108,"dex":68,"int":72,"vit":88,"spd":115,"cri":16}'::jsonb,
  '[{"itemId":107,"chance":0.14,"minQty":1,"maxQty":2},{"itemId":311,"chance":0.05,"minQty":1,"maxQty":1},{"itemId":336,"chance":0.05,"minQty":1,"maxQty":1}]'::jsonb, 65),
(125, '오거 마법사',    63, 16200, 5200, 2300,
  '{"str":95,"dex":45,"int":90,"vit":95,"spd":90,"cri":12}'::jsonb,
  '[{"itemId":107,"chance":0.15,"minQty":1,"maxQty":2},{"itemId":321,"chance":0.05,"minQty":1,"maxQty":1},{"itemId":342,"chance":0.05,"minQty":1,"maxQty":1}]'::jsonb, 68),
(126, '와이번',        64, 17500, 5600, 2500,
  '{"str":115,"dex":80,"int":40,"vit":95,"spd":130,"cri":18}'::jsonb,
  '[{"itemId":107,"chance":0.16,"minQty":1,"maxQty":2},{"itemId":301,"chance":0.06,"minQty":1,"maxQty":1},{"itemId":310,"chance":0.06,"minQty":1,"maxQty":1}]'::jsonb, 72),
(127, '만티코어',      65, 18800, 6000, 2700,
  '{"str":120,"dex":85,"int":55,"vit":100,"spd":125,"cri":20}'::jsonb,
  '[{"itemId":107,"chance":0.18,"minQty":1,"maxQty":2},{"itemId":340,"chance":0.06,"minQty":1,"maxQty":1},{"itemId":342,"chance":0.06,"minQty":1,"maxQty":1}]'::jsonb, 75),
(128, '고대 리치',      66, 20000, 6500, 3000,
  '{"str":85,"dex":55,"int":130,"vit":80,"spd":105,"cri":14}'::jsonb,
  '[{"itemId":107,"chance":0.20,"minQty":1,"maxQty":2},{"itemId":320,"chance":0.06,"minQty":1,"maxQty":1},{"itemId":321,"chance":0.06,"minQty":1,"maxQty":1}]'::jsonb, 78),
(129, '어둠의 피닉스',  68, 22000, 7200, 3500,
  '{"str":130,"dex":95,"int":100,"vit":110,"spd":135,"cri":22}'::jsonb,
  '[{"itemId":107,"chance":0.22,"minQty":1,"maxQty":2},{"itemId":302,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":312,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":322,"chance":0.04,"minQty":1,"maxQty":1}]'::jsonb, 82),
(135, '보스: 타이탄',   70, 55000, 18000, 12000,
  '{"str":175,"dex":110,"int":120,"vit":160,"spd":115,"cri":24}'::jsonb,
  '[{"itemId":107,"chance":1.0,"minQty":3,"maxQty":6},{"itemId":303,"chance":0.15,"minQty":1,"maxQty":1},{"itemId":313,"chance":0.15,"minQty":1,"maxQty":1},{"itemId":323,"chance":0.15,"minQty":1,"maxQty":1},{"itemId":331,"chance":0.10,"minQty":1,"maxQty":1},{"itemId":333,"chance":0.08,"minQty":1,"maxQty":1},{"itemId":337,"chance":0.08,"minQty":1,"maxQty":1},{"itemId":341,"chance":0.06,"minQty":1,"maxQty":1},{"itemId":343,"chance":0.06,"minQty":1,"maxQty":1}]'::jsonb, 300);

-- ========== Lv.50-70 필드 ==========

INSERT INTO fields (id, name, required_level, monster_pool, description) VALUES
(20, '나가의 소굴',    50, '[120,121]'::jsonb,     '나가와 트롤이 서식하는 지하 소굴.'),
(21, '하늘 절벽',      54, '[122,123]'::jsonb,     '그리폰과 가고일이 날아다니는 절벽.'),
(22, '히드라의 둥지',  58, '[130]'::jsonb,         '다두 괴수 히드라가 둥지를 틀었다.'),
(23, '황혼의 성채',    62, '[124,125,126]'::jsonb,  '언데드와 야수가 뒤섞인 성채.'),
(24, '타이탄의 왕좌',  66, '[127,128,129]'::jsonb,  '만티코어와 리치가 지키는 고대 영역.'),
(25, '멸망의 정점',    70, '[135]'::jsonb,          '타이탄이 군림하는 최후의 왕좌.');

-- ========== 신규 퀘스트 ==========

INSERT INTO quests (name, description, required_level, target_kind, target_id, target_count, reward_exp, reward_gold, reward_item_id, reward_item_qty) VALUES
('나가 소탕',         '나가 전사 15마리를 처치하라.',    52, 'monster', 120, 15, 120000, 40000, 107, 2),
('트롤 사냥',         '트롤 광전사 12마리를 처치하라.',  54, 'monster', 121, 12, 150000, 50000, 107, 3),
('히드라 정벌',       '히드라를 쓰러뜨려라.',           58, 'monster', 130,  1, 400000, 150000, 341, 1),
('망자의 기사 처단',  '망자의 기사 10마리를 처치하라.',   62, 'monster', 124, 10, 250000, 80000, 107, 4),
('고대 리치 퇴치',    '고대 리치 8마리를 처치하라.',     66, 'monster', 128,  8, 350000, 120000, 107, 5),
('타이탄의 종말',     '타이탄을 쓰러뜨려라.',           70, 'monster', 135,  1, 1000000, 500000, 343, 1);

COMMIT;
