-- v0.6: 컨텐츠 확장 (사냥터/몬스터/아이템)
BEGIN;

-- =========================================
-- 아이템 추가 (200번대부터)
-- =========================================

-- === 무기: 전사/검사/암살자 계열 (STR) ===
INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
-- Lv.5~15
(200, '강철 장검',        'weapon','common','weapon','{"str":8}',                   '단단한 강철 검', 1, 60),
(201, '양손 대검',        'weapon','rare',  'weapon','{"str":14,"vit":3}',          '두 손으로 휘두르는 묵직한 대검', 1, 220),
(202, '판관의 검',        'weapon','rare',  'weapon','{"str":12,"dex":4,"cri":2}',  '정의로운 자의 검', 1, 240),
-- Lv.16~30
(203, '미스릴 장검',      'weapon','epic',  'weapon','{"str":20,"vit":5,"cri":3}',  '미스릴로 제련된 명검', 1, 900),
(204, '괴력의 배틀엑스',   'weapon','epic',  'weapon','{"str":28,"vit":7}',          '휘두르는 순간 바람이 갈라진다', 1, 1050),
(205, '피의 낫',          'weapon','epic',  'weapon','{"str":24,"dex":8,"cri":5}',  '생명을 거두는 사신의 도구', 1, 1100),
-- Lv.31~50
(206, '용살자의 대검',    'weapon','legendary','weapon','{"str":42,"vit":12,"cri":6}',   '용의 비늘을 꿰뚫은 전설의 검', 1, 4500),
(207, '어둠의 도끼',      'weapon','legendary','weapon','{"str":50,"vit":8,"cri":10}',   '어둠의 군주가 남긴 도끼', 1, 5200);

-- === 무기: 도적/궁수 계열 (DEX) ===
INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
(210, '사냥꾼의 활',       'weapon','common','weapon','{"dex":9,"cri":2}',           '숙련된 사냥꾼의 활', 1, 60),
(211, '쌍수 단검',        'weapon','rare',  'weapon','{"dex":13,"cri":5}',          '양손잡이 도적의 단검', 1, 220),
(212, '정교한 장궁',       'weapon','rare',  'weapon','{"dex":15,"cri":4}',          '먼 거리도 정확하게', 1, 240),
(213, '암살자의 비수',     'weapon','epic',  'weapon','{"dex":22,"cri":10}',         '치명상을 노리는 칼날', 1, 950),
(214, '바람의 활',         'weapon','epic',  'weapon','{"dex":26,"cri":8,"spd":5}',  '바람을 타고 날아가는 화살', 1, 1080),
(215, '그림자 단검',       'weapon','epic',  'weapon','{"dex":24,"cri":12,"spd":3}', '움직임을 감춘다', 1, 1050),
(216, '황혼의 장궁',       'weapon','legendary','weapon','{"dex":44,"cri":14,"spd":8}',  '황혼에 울리는 활시위', 1, 4800),
(217, '혈월의 쌍검',       'weapon','legendary','weapon','{"dex":48,"cri":18}',          '붉은 달빛 아래의 두 검', 1, 5100);

-- === 무기: 마법사/사제/드루이드 계열 (INT) ===
INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
(220, '현자의 지팡이',     'weapon','common','weapon','{"int":10}',                   '지혜가 깃든 지팡이', 1, 60),
(221, '룬 지팡이',         'weapon','rare',  'weapon','{"int":16,"vit":2}',           '고대 룬이 새겨진 지팡이', 1, 220),
(222, '성직자의 홀',       'weapon','rare',  'weapon','{"int":14,"vit":4}',           '신성한 빛이 어린 홀', 1, 220),
(223, '대마법사의 지팡이', 'weapon','epic',  'weapon','{"int":26,"vit":5}',           '마력이 응축된 지팡이', 1, 980),
(224, '자연의 홀',         'weapon','epic',  'weapon','{"int":22,"vit":8,"cri":2}',   '대지의 힘을 전한다', 1, 920),
(225, '영혼의 오브',       'weapon','epic',  'weapon','{"int":28,"vit":4,"cri":3}',   '영혼을 읽는 구슬', 1, 1050),
(226, '창조의 지팡이',     'weapon','legendary','weapon','{"int":48,"vit":10,"cri":5}',    '세계를 빚는 마력', 1, 4900),
(227, '어둠을 가르는 홀',   'weapon','legendary','weapon','{"int":44,"vit":15}',           '어둠을 정화하는 빛', 1, 4700);

-- === 방어구: 투구 ===
INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
(230, '철 투구',           'armor','common','helm','{"vit":6}',                '철판 투구', 1, 40),
(231, '체인 두건',         'armor','common','helm','{"vit":5,"dex":1}',        '사슬이 엮인 두건', 1, 40),
(232, '마법사 모자',       'armor','common','helm','{"int":5,"vit":2}',        '견습 마법사의 모자', 1, 45),
(233, '기사의 투구',       'armor','rare',  'helm','{"vit":12,"str":2}',       '기사단 정규 투구', 1, 150),
(234, '비단 두건',         'armor','rare',  'helm','{"dex":8,"vit":5}',        '은신에 유리한 두건', 1, 160),
(235, '현자의 관',         'armor','rare',  'helm','{"int":10,"vit":4}',       '지식을 담는 관', 1, 170),
(236, '용린 투구',         'armor','epic',  'helm','{"vit":20,"str":5,"cri":2}', '용의 비늘 투구', 1, 680),
(237, '그림자 두건',       'armor','epic',  'helm','{"dex":16,"cri":6,"vit":6}', '그림자와 하나가 된다', 1, 720),
(238, '대마법사의 관',     'armor','epic',  'helm','{"int":20,"vit":8}',       '마력이 새겨진 관', 1, 740),
(239, '전설의 왕관',       'armor','legendary','helm','{"vit":30,"str":8,"int":8,"cri":4}', '왕의 품격이 깃든 왕관', 1, 3200);

-- === 방어구: 갑옷 ===
INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
(240, '판금 갑옷',         'armor','common','chest','{"vit":10}',                '두꺼운 판금 갑옷', 1, 80),
(241, '체인 갑옷',         'armor','common','chest','{"vit":8,"dex":2}',         '사슬 엮은 갑옷', 1, 80),
(242, '로브',              'armor','common','chest','{"int":7,"vit":4}',         '마법사 로브', 1, 80),
(243, '미늘 갑옷',         'armor','rare',  'chest','{"vit":18,"str":3}',        '미늘형 갑옷', 1, 300),
(244, '영혼 갑옷',         'armor','rare',  'chest','{"dex":10,"vit":10}',       '가볍고 견고한 가죽갑옷', 1, 310),
(245, '비전의 로브',       'armor','rare',  'chest','{"int":14,"vit":7}',        '마력을 두른 로브', 1, 320),
(246, '용린 갑주',         'armor','epic',  'chest','{"vit":30,"str":8}',        '용의 갑주', 1, 1300),
(247, '그림자 망토',       'armor','epic',  'chest','{"dex":22,"vit":12,"cri":4}', '빛을 삼키는 망토', 1, 1380),
(248, '대마법사의 로브',   'armor','epic',  'chest','{"int":28,"vit":10}',       '마력의 근원', 1, 1420),
(249, '전설의 갑주',       'armor','legendary','chest','{"vit":46,"str":10,"int":10}', '전설 용사의 갑주', 1, 5500);

-- === 방어구: 각반 ===
INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
(250, '철 각반',           'armor','common','legs','{"vit":7}',                 '기본 철 각반', 1, 50),
(251, '가죽 바지',         'armor','common','legs','{"vit":5,"dex":2}',         '가벼운 가죽 바지', 1, 50),
(252, '룬 각반',           'armor','rare',  'legs','{"vit":12,"str":2}',        '룬이 새겨진 각반', 1, 200),
(253, '경량 각반',         'armor','rare',  'legs','{"dex":8,"vit":7}',         '민첩성을 더한 각반', 1, 210),
(254, '용린 각반',         'armor','epic',  'legs','{"vit":22,"str":5}',        '용의 비늘 각반', 1, 920),
(255, '전설 각반',         'armor','legendary','legs','{"vit":34,"dex":8}',    '전설의 각반', 1, 4000);

-- === 방어구: 장화 ===
INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
(260, '철 장화',           'armor','common','boots','{"vit":4,"spd":2}',        '철판 장화', 1, 40),
(261, '경량 장화',         'armor','common','boots','{"dex":4,"spd":5}',        '가벼운 장화', 1, 40),
(262, '바람의 장화',       'armor','rare',  'boots','{"dex":8,"spd":10,"vit":4}', '바람처럼 빠른 장화', 1, 180),
(263, '요새의 장화',       'armor','rare',  'boots','{"vit":12,"spd":4}',       '견고한 장화', 1, 170),
(264, '그림자 장화',       'armor','epic',  'boots','{"dex":15,"spd":14,"cri":3}', '소리 없이 움직인다', 1, 820),
(265, '전설 장화',         'armor','legendary','boots','{"vit":22,"dex":14,"spd":18}', '전설의 발걸음', 1, 3800);

-- === 장신구: 반지 ===
INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
(270, '은 반지',           'accessory','common','ring','{"cri":3}',                    '매끈한 은반지', 1, 30),
(271, '튼튼한 반지',       'accessory','common','ring','{"vit":4}',                    '내구도 높은 반지', 1, 30),
(272, '사자의 반지',       'accessory','rare',  'ring','{"str":6,"cri":4}',             '용맹이 깃든 반지', 1, 140),
(273, '민첩의 반지',       'accessory','rare',  'ring','{"dex":6,"spd":5}',             '민첩함을 더한다', 1, 140),
(274, '마력의 반지',       'accessory','rare',  'ring','{"int":6,"vit":3}',             '마력을 모은다', 1, 150),
(275, '용의 반지',         'accessory','epic',  'ring','{"str":10,"vit":6,"cri":6}',    '용의 힘', 1, 640),
(276, '바람의 반지',       'accessory','epic',  'ring','{"dex":10,"spd":10,"cri":5}',   '바람의 가호', 1, 680),
(277, '지혜의 반지',       'accessory','epic',  'ring','{"int":12,"vit":5,"cri":3}',    '현자의 지혜', 1, 660),
(278, '전설의 반지',       'accessory','legendary','ring','{"str":15,"dex":15,"int":15,"vit":8,"cri":8}', '전설의 힘이 깃든 반지', 1, 3500);

-- === 장신구: 목걸이 ===
INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
(280, '수정 목걸이',       'accessory','common','amulet','{"int":3,"vit":2}',           '작은 수정 목걸이', 1, 30),
(281, '늑대 송곳니',       'accessory','common','amulet','{"str":3,"cri":1}',           '야수의 증표', 1, 30),
(282, '생명의 목걸이',     'accessory','rare',  'amulet','{"vit":10,"int":3}',          '생명력이 깃든 목걸이', 1, 150),
(283, '스피드의 목걸이',   'accessory','rare',  'amulet','{"dex":4,"spd":8}',           '스피드 부여', 1, 150),
(284, '보호의 목걸이',     'accessory','epic',  'amulet','{"vit":18,"str":4,"int":4}',  '강력한 보호막', 1, 690),
(285, '불멸의 목걸이',     'accessory','legendary','amulet','{"vit":28,"str":10,"int":10,"dex":10,"cri":5}', '불멸의 힘', 1, 3800);

-- === 새 소모품 ===
INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
(104, '고급 체력 물약', 'consumable', 'epic', NULL, NULL, 'HP 400 회복',  99, 150),
(105, '고급 마나 물약', 'consumable', 'epic', NULL, NULL, 'MP 300 회복',  99, 180),
(106, '최상급 체력 물약', 'consumable', 'legendary', NULL, NULL, 'HP 1000 회복', 99, 500),
(107, '최상급 마나 물약', 'consumable', 'legendary', NULL, NULL, 'MP 800 회복', 99, 600);

SELECT setval('items_id_seq', (SELECT MAX(id) FROM items));

-- === 상점 추가 (고급 물약) ===
INSERT INTO shop_entries (item_id, buy_price, stock) VALUES
(104, 300, -1),
(105, 360, -1);

-- =========================================
-- 몬스터 추가
-- =========================================
INSERT INTO monsters (id, name, level, max_hp, exp_reward, gold_reward, stats, drop_table, avg_kill_time_sec) VALUES
(20, '동굴 박쥐',    12, 400, 130, 55,  '{"str":16,"dex":20,"int":4,"vit":12,"spd":150,"cri":10}',
  '[{"itemId":102,"chance":0.08,"minQty":1,"maxQty":1},{"itemId":200,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":270,"chance":0.03,"minQty":1,"maxQty":1}]'::jsonb, 13),
(21, '광산 도적',    14, 520, 165, 75,  '{"str":22,"dex":16,"int":5,"vit":16,"spd":110,"cri":8}',
  '[{"itemId":102,"chance":0.10,"minQty":1,"maxQty":2},{"itemId":230,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":250,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":201,"chance":0.02,"minQty":1,"maxQty":1}]'::jsonb, 15),
(30, '늪 악어',      16, 720, 210, 95,  '{"str":28,"dex":12,"int":3,"vit":22,"spd":85,"cri":6}',
  '[{"itemId":102,"chance":0.12,"minQty":1,"maxQty":2},{"itemId":243,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":211,"chance":0.03,"minQty":1,"maxQty":1}]'::jsonb, 17),
(31, '저주받은 유령', 18, 820, 260, 110, '{"str":14,"dex":20,"int":24,"vit":14,"spd":125,"cri":10}',
  '[{"itemId":103,"chance":0.10,"minQty":1,"maxQty":1},{"itemId":272,"chance":0.05,"minQty":1,"maxQty":1},{"itemId":221,"chance":0.03,"minQty":1,"maxQty":1}]'::jsonb, 18),
(40, '사막 전갈',    20, 1000, 320, 135, '{"str":30,"dex":22,"int":4,"vit":24,"spd":105,"cri":12}',
  '[{"itemId":103,"chance":0.12,"minQty":1,"maxQty":2},{"itemId":244,"chance":0.05,"minQty":1,"maxQty":1},{"itemId":273,"chance":0.04,"minQty":1,"maxQty":1}]'::jsonb, 19),
(41, '방랑 기사',    22, 1200, 400, 170, '{"str":36,"dex":18,"int":8,"vit":28,"spd":100,"cri":8}',
  '[{"itemId":103,"chance":0.14,"minQty":1,"maxQty":2},{"itemId":202,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":233,"chance":0.04,"minQty":1,"maxQty":1}]'::jsonb, 21),
(50, '모래 웜',      24, 1550, 500, 210, '{"str":40,"dex":14,"int":5,"vit":36,"spd":80,"cri":6}',
  '[{"itemId":104,"chance":0.08,"minQty":1,"maxQty":1},{"itemId":245,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":234,"chance":0.04,"minQty":1,"maxQty":1}]'::jsonb, 24),
(51, '도굴꾼',       26, 1800, 590, 250, '{"str":34,"dex":30,"int":12,"vit":28,"spd":120,"cri":14}',
  '[{"itemId":104,"chance":0.09,"minQty":1,"maxQty":2},{"itemId":212,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":274,"chance":0.04,"minQty":1,"maxQty":1}]'::jsonb, 25),
(60, '용암 정령',    28, 2200, 720, 310, '{"str":42,"dex":20,"int":32,"vit":30,"spd":110,"cri":10}',
  '[{"itemId":104,"chance":0.12,"minQty":1,"maxQty":2},{"itemId":203,"chance":0.03,"minQty":1,"maxQty":1},{"itemId":235,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":223,"chance":0.03,"minQty":1,"maxQty":1}]'::jsonb, 28),
(61, '마그마 골렘',  30, 2900, 900, 400, '{"str":55,"dex":16,"int":20,"vit":48,"spd":85,"cri":8}',
  '[{"itemId":104,"chance":0.15,"minQty":1,"maxQty":2},{"itemId":204,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":252,"chance":0.04,"minQty":1,"maxQty":1}]'::jsonb, 32),
(70, '보스: 염제',   32, 6500, 2200, 1000,'{"str":75,"dex":35,"int":50,"vit":65,"spd":105,"cri":15}',
  '[{"itemId":106,"chance":0.50,"minQty":1,"maxQty":2},{"itemId":204,"chance":0.18,"minQty":1,"maxQty":1},{"itemId":275,"chance":0.15,"minQty":1,"maxQty":1},{"itemId":246,"chance":0.10,"minQty":1,"maxQty":1}]'::jsonb, 85),
(80, '서리 늑대',    34, 3100, 1050, 450, '{"str":48,"dex":38,"int":14,"vit":36,"spd":135,"cri":14}',
  '[{"itemId":105,"chance":0.12,"minQty":1,"maxQty":2},{"itemId":213,"chance":0.04,"minQty":1,"maxQty":1},{"itemId":253,"chance":0.04,"minQty":1,"maxQty":1}]'::jsonb, 33),
(81, '얼음 거인',    36, 3800, 1280, 560, '{"str":62,"dex":22,"int":28,"vit":55,"spd":80,"cri":10}',
  '[{"itemId":105,"chance":0.14,"minQty":1,"maxQty":2},{"itemId":205,"chance":0.05,"minQty":1,"maxQty":1},{"itemId":236,"chance":0.04,"minQty":1,"maxQty":1}]'::jsonb, 38),
(90, '유적 수호자',  38, 4500, 1480, 650, '{"str":55,"dex":28,"int":40,"vit":50,"spd":95,"cri":10}',
  '[{"itemId":105,"chance":0.15,"minQty":1,"maxQty":2},{"itemId":224,"chance":0.05,"minQty":1,"maxQty":1},{"itemId":247,"chance":0.04,"minQty":1,"maxQty":1}]'::jsonb, 40),
(91, '미라',        40, 5200, 1700, 750, '{"str":60,"dex":26,"int":45,"vit":58,"spd":85,"cri":8}',
  '[{"itemId":105,"chance":0.15,"minQty":1,"maxQty":2},{"itemId":225,"chance":0.05,"minQty":1,"maxQty":1},{"itemId":214,"chance":0.05,"minQty":1,"maxQty":1},{"itemId":237,"chance":0.04,"minQty":1,"maxQty":1}]'::jsonb, 42),
(100, '악마 수하',   43, 6400, 2050, 920, '{"str":72,"dex":45,"int":55,"vit":62,"spd":115,"cri":15}',
  '[{"itemId":106,"chance":0.12,"minQty":1,"maxQty":1},{"itemId":248,"chance":0.05,"minQty":1,"maxQty":1},{"itemId":276,"chance":0.04,"minQty":1,"maxQty":1}]'::jsonb, 48),
(101, '심연의 그림자', 45, 7500, 2400, 1080,'{"str":80,"dex":55,"int":50,"vit":60,"spd":130,"cri":20}',
  '[{"itemId":106,"chance":0.13,"minQty":1,"maxQty":1},{"itemId":215,"chance":0.05,"minQty":1,"maxQty":1},{"itemId":277,"chance":0.05,"minQty":1,"maxQty":1}]'::jsonb, 50),
(110, '보스: 어둠의 군주', 50, 18000, 6500, 4500,'{"str":110,"dex":80,"int":95,"vit":100,"spd":130,"cri":22}',
  '[{"itemId":107,"chance":0.80,"minQty":2,"maxQty":4},{"itemId":206,"chance":0.15,"minQty":1,"maxQty":1},{"itemId":207,"chance":0.12,"minQty":1,"maxQty":1},{"itemId":216,"chance":0.12,"minQty":1,"maxQty":1},{"itemId":217,"chance":0.12,"minQty":1,"maxQty":1},{"itemId":226,"chance":0.12,"minQty":1,"maxQty":1},{"itemId":227,"chance":0.12,"minQty":1,"maxQty":1},{"itemId":239,"chance":0.08,"minQty":1,"maxQty":1},{"itemId":249,"chance":0.06,"minQty":1,"maxQty":1},{"itemId":255,"chance":0.06,"minQty":1,"maxQty":1},{"itemId":265,"chance":0.06,"minQty":1,"maxQty":1},{"itemId":278,"chance":0.05,"minQty":1,"maxQty":1},{"itemId":285,"chance":0.05,"minQty":1,"maxQty":1}]'::jsonb, 180);

SELECT setval('monsters_id_seq', (SELECT MAX(id) FROM monsters));

-- =========================================
-- 사냥터 추가
-- =========================================
INSERT INTO fields (id, name, required_level, monster_pool, description) VALUES
(10, '버려진 광산',   12, '[20,21]'::jsonb,       '어둠 속 동굴. 박쥐와 도적들이 숨어산다.'),
(11, '저주받은 늪',   16, '[30,31]'::jsonb,       '안개가 자욱한 늪지. 망령이 떠돈다.'),
(12, '사막 입구',     20, '[40,41]'::jsonb,       '뜨거운 바람과 모래의 땅. 방랑자들이 모인다.'),
(13, '사막 심부',     24, '[50,51]'::jsonb,       '모래폭풍 너머의 영역. 거대 웜이 서식한다.'),
(14, '용암 동굴',     28, '[60,61]'::jsonb,       '지열로 달궈진 동굴. 정령과 골렘이 지킨다.'),
(15, '화염 궁전',     32, '[70]'::jsonb,          '화염의 왕좌. 염제가 군림한다.'),
(16, '북쪽 빙원',     34, '[80,81]'::jsonb,       '끝없는 눈보라의 땅.'),
(17, '고대 유적',     38, '[90,91]'::jsonb,       '잊혀진 문명의 흔적. 수호자들이 경계한다.'),
(18, '어둠의 문',     43, '[100,101]'::jsonb,     '심연으로 이어지는 관문. 악마들의 영역.'),
(19, '심연',         50, '[110]'::jsonb,          '어둠의 군주가 기다리는 최후의 공간.');

SELECT setval('fields_id_seq', (SELECT MAX(id) FROM fields));

-- =========================================
-- 퀘스트 추가 (신규 몬스터 대상)
-- =========================================
INSERT INTO quests (name, description, required_level, target_kind, target_id, target_count, reward_exp, reward_gold, reward_item_id, reward_item_qty) VALUES
('박쥐 대청소',      '버려진 광산의 동굴 박쥐 20마리를 처치하라.',   12, 'monster', 20, 20, 4000,  1200, 102, 5),
('광산 탈환',        '광산 도적 15마리를 처치하라.',                 14, 'monster', 21, 15, 5500,  1800, 104, 3),
('늪을 정화하라',    '늪 악어 12마리를 처치하라.',                   16, 'monster', 30, 12, 7000,  2500, 105, 2),
('망령 퇴치',        '저주받은 유령 15마리를 처치하라.',             18, 'monster', 31, 15, 9500,  3400, 105, 3),
('사막 순찰',        '사막 전갈 20마리를 처치하라.',                 20, 'monster', 40, 20, 13000, 5000, 105, 4),
('방랑 기사 처단',   '방랑 기사 10마리를 처치하라.',                 22, 'monster', 41, 10, 16000, 6200, 106, 1),
('골렘 파괴자',      '마그마 골렘 10마리를 처치하라.',               30, 'monster', 61, 10, 34000, 13000, 106, 2),
('염제 처단',        '화염의 왕 염제를 쓰러뜨려라.',                 32, 'monster', 70,  1, 80000, 30000, 275, 1),
('얼음 사냥꾼',      '얼음 거인 8마리를 처치하라.',                  36, 'monster', 81,  8, 52000, 20000, 106, 3),
('심연 도전자',      '심연의 군주를 처단하라.',                      50, 'monster', 110, 1, 300000, 100000, 278, 1);

COMMIT;
