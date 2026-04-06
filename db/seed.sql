-- 마지막이야기 초기 데이터 v0.1
-- Usage: psql -U postgres -d laststory -f seed.sql

BEGIN;

-- === 아이템 ===
INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
-- 무기
(1, '녹슨 단검',       'weapon', 'common', 'weapon', '{"str":3,"dex":2}',     '초보 도적의 단검', 1, 10),
(2, '낡은 장검',       'weapon', 'common', 'weapon', '{"str":5}',              '초보 검사의 검',   1, 12),
(3, '짧은 활',         'weapon', 'common', 'weapon', '{"dex":5}',              '훈련용 활',        1, 12),
(4, '견습 마법봉',     'weapon', 'common', 'weapon', '{"int":6}',              '마나 유도봉',      1, 15),
(5, '둔탁한 철퇴',     'weapon', 'common', 'weapon', '{"str":4,"vit":2}',     '무겁지만 단단',    1, 14),
-- 방어구
(10, '가죽 투구',      'armor', 'common', 'helm',  '{"vit":3}',                '기본 투구',       1, 10),
(11, '가죽 갑옷',      'armor', 'common', 'chest', '{"vit":6}',                '기본 갑옷',       1, 20),
(12, '가죽 각반',      'armor', 'common', 'legs',  '{"vit":4}',                '기본 각반',       1, 12),
(13, '가죽 장화',      'armor', 'common', 'boots', '{"dex":2,"spd":3}',       '기본 장화',       1, 10),
-- 장신구
(20, '구리 반지',      'accessory','common','ring', '{"cri":2}',               '작은 반지',       1, 15),
(21, '낡은 목걸이',    'accessory','common','amulet','{"int":2,"vit":1}',     '낡은 목걸이',     1, 15),
-- 소모품
(100, '작은 체력 물약', 'consumable', 'common', NULL, NULL, 'HP 50 회복',   99, 10),
(101, '작은 마나 물약', 'consumable', 'common', NULL, NULL, 'MP 30 회복',   99, 15),
(102, '중급 체력 물약', 'consumable', 'rare',   NULL, NULL, 'HP 150 회복',  99, 40),
(103, '중급 마나 물약', 'consumable', 'rare',   NULL, NULL, 'MP 100 회복',  99, 50);

SELECT setval('items_id_seq', (SELECT MAX(id) FROM items));

-- === 상점 판매 목록 (마을 NPC) ===
INSERT INTO shop_entries (item_id, buy_price, stock) VALUES
(100, 20, -1),
(101, 30, -1),
(102, 80, -1),
(103, 100, -1);

-- === 몬스터 ===
INSERT INTO monsters (id, name, level, max_hp, exp_reward, gold_reward, stats, drop_table, avg_kill_time_sec) VALUES
-- 초원 (1~5)
(1, '들쥐',       1,  40,  12, 5,  '{"str":4,"dex":6,"int":1,"vit":4,"spd":110,"cri":3}',
    '[{"itemId":100,"chance":0.15,"minQty":1,"maxQty":1}]'::jsonb, 6),
(2, '고블린',     2,  70,  20, 10, '{"str":7,"dex":7,"int":2,"vit":6,"spd":95,"cri":5}',
    '[{"itemId":100,"chance":0.12,"minQty":1,"maxQty":2},{"itemId":10,"chance":0.04,"minQty":1,"maxQty":1}]'::jsonb, 8),
(3, '늑대',       3,  110, 30, 14, '{"str":10,"dex":11,"int":2,"vit":8,"spd":130,"cri":8}',
    '[{"itemId":101,"chance":0.10,"minQty":1,"maxQty":1},{"itemId":13,"chance":0.03,"minQty":1,"maxQty":1}]'::jsonb, 10),
-- 숲 (5~12)
(10, '숲 거미',   6,  180, 55,  22, '{"str":13,"dex":15,"int":3,"vit":10,"spd":120,"cri":10}',
    '[{"itemId":102,"chance":0.08,"minQty":1,"maxQty":1},{"itemId":1,"chance":0.03,"minQty":1,"maxQty":1}]'::jsonb, 11),
(11, '오크 전사', 8,  280, 85,  38, '{"str":22,"dex":10,"int":4,"vit":18,"spd":85,"cri":6}',
    '[{"itemId":102,"chance":0.10,"minQty":1,"maxQty":2},{"itemId":11,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":5,"chance":0.03,"minQty":1,"maxQty":1}]'::jsonb, 14),
(12, '보스: 숲의 왕', 12, 1400, 400, 180, '{"str":38,"dex":18,"int":8,"vit":35,"spd":100,"cri":12}',
    '[{"itemId":103,"chance":0.40,"minQty":1,"maxQty":2},{"itemId":20,"chance":0.20,"minQty":1,"maxQty":1},{"itemId":21,"chance":0.15,"minQty":1,"maxQty":1}]'::jsonb, 60);

SELECT setval('monsters_id_seq', (SELECT MAX(id) FROM monsters));

-- === 필드 ===
INSERT INTO fields (id, name, required_level, monster_pool, description) VALUES
(1, '초원',       1,  '[1,2]'::jsonb,       '마을 앞 평화로운 초원. 약한 짐승이 서식한다.'),
(2, '언덕길',     3,  '[2,3]'::jsonb,       '가파른 언덕. 늑대 무리가 돌아다닌다.'),
(3, '숲 외곽',    5,  '[3,10]'::jsonb,      '어두운 숲의 가장자리. 거미줄이 곳곳에 쳐져있다.'),
(4, '깊은 숲',    8,  '[10,11]'::jsonb,     '오크 부족의 영역. 조심하라.'),
(5, '숲의 중심',  12, '[11,12]'::jsonb,     '숲의 왕이 군림하는 성역.');

SELECT setval('fields_id_seq', (SELECT MAX(id) FROM fields));

-- === 스킬 (클래스별 3개씩, v0.1) ===
INSERT INTO skills (class_name, name, description, required_level, cooldown_sec, mp_cost, damage_mult, kind, target) VALUES
-- 전사
('warrior', '강타',          '단일 적에게 180% 물리 데미지',       1, 6,  5,  1.8, 'damage', 'enemy'),
('warrior', '광전사의 포효', '3턴간 공격력 +35%',                  3, 20, 10, 0.0, 'buff',   'self'),
('warrior', '회오리 베기',    '전체 적에게 120% 데미지',            5, 15, 15, 1.2, 'damage', 'all_enemies'),
-- 검사
('swordsman','베기',         '단일 적에게 160% 데미지',            1, 5,  4,  1.6, 'damage', 'enemy'),
('swordsman','찌르기 연타',   '단일 적에게 70% 데미지 3회',         3, 12, 10, 2.1, 'damage', 'enemy'),
('swordsman','방어 자세',     '방어력 +40% (3턴)',                  5, 18, 8,  0.0, 'buff',   'self'),
-- 궁수
('archer','관통사격',      '단일 적에게 175% 데미지, 방어 무시 20%', 1, 5, 5, 1.75, 'damage', 'enemy'),
('archer','다중사격',      '랜덤 적 3회 공격, 회당 80%',              3, 12,12, 2.4, 'damage', 'all_enemies'),
('archer','명중 집중',      '치명타율 +15% (3턴)',                    5, 20, 8, 0.0, 'buff',   'self'),
-- 도적
('rogue','독 찌르기',     '단일 적 100% + 독(5%/3턴)',               1, 6, 6, 1.0, 'damage', 'enemy'),
('rogue','그림자 이동',    '다음 공격 1회 회피 + 선공',                3, 15, 10, 0.0, 'buff',   'self'),
('rogue','연속 베기',      '단일 적에게 50% 3~5회',                    5, 14, 14, 2.5, 'damage', 'enemy'),
-- 암살자
('assassin','급소 찌르기','단일 적 220% 데미지, 긴 쿨다운',          1, 10, 10, 2.2, 'damage', 'enemy'),
('assassin','암습',       '선공 + 150% 데미지',                        3, 12, 8, 1.5, 'damage', 'enemy'),
('assassin','처형',       'HP 25% 이하 적에게 300% 데미지',           5, 20, 15, 3.0, 'damage', 'enemy'),
-- 마법사
('mage','파이어볼',     '단일 적 170% 화염 데미지',                  1, 5,  8,  1.7, 'damage', 'enemy'),
('mage','블리자드',     '전체 적 100% 냉기 + 스피드 -20%(2턴)',      3, 15, 18, 1.0, 'damage', 'all_enemies'),
('mage','메테오',       '전체 적 180% 데미지',                        7, 25, 30, 1.8, 'damage', 'all_enemies'),
-- 사제
('priest','치유',       '자신 HP 회복(지력 기반 150%)',               1, 6, 10, 1.5, 'heal',   'self'),
('priest','신성한 빛',  '자신 HP 80% 회복',                            5, 20, 20, 0.8, 'heal',   'self'),
('priest','축복',       '스피드 +30% (3턴)',                            3, 18, 12, 0.0, 'buff',   'self'),
-- 드루이드
('druid','가시 덩굴',  '단일 적 150% 자연 데미지',                    1, 5, 7, 1.5, 'damage', 'enemy'),
('druid','자연 치유',  '자신 HP 60% 회복',                             3, 15, 15, 0.6, 'heal',   'self'),
('druid','곰 변신',    '공격력+25%, HP+20% (5턴)',                    5, 30, 20, 0.0, 'buff',   'self');

COMMIT;
