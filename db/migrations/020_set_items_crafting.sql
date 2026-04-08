-- ========================================
-- 세트 아이템 + 조합 시스템
-- ========================================

-- 세트 정의 테이블
CREATE TABLE IF NOT EXISTS item_sets (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  boss_name TEXT NOT NULL,
  set_bonus_2 JSONB DEFAULT '{}',  -- 2세트 효과
  set_bonus_4 JSONB DEFAULT '{}',  -- 4세트 효과
  set_bonus_6 JSONB DEFAULT '{}',  -- 6세트 (풀세트) 효과
  description TEXT DEFAULT ''
);

-- 조합 레시피 테이블
CREATE TABLE IF NOT EXISTS craft_recipes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  material_item_id INT NOT NULL REFERENCES items(id),
  material_qty INT NOT NULL DEFAULT 3,
  result_type TEXT NOT NULL,  -- 'weapon_random', 'accessory_random', 'armor_random'
  result_item_ids INT[] NOT NULL,  -- 결과 아이템 ID 배열 (랜덤 선택)
  set_id INT REFERENCES item_sets(id)
);

-- ========================================
-- 1. 발라카스 세트 아이템 (Lv.80)
-- ========================================

-- 무기 (S등급 재료)
INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level) VALUES
('발라카스의 대검', 'weapon', 'legendary', 'weapon', '{"str":45,"vit":20,"spd":30}', '용왕의 화염이 깃든 대검. [발라카스 세트]', 1, 20000, 70),
('발라카스의 지팡이', 'weapon', 'legendary', 'weapon', '{"int":50,"vit":15,"spd":25}', '용왕의 마력이 깃든 지팡이. [발라카스 세트]', 1, 20000, 70),
('발라카스의 홀', 'weapon', 'legendary', 'weapon', '{"int":40,"vit":25,"spd":20}', '용왕의 신성이 깃든 홀. [발라카스 세트]', 1, 20000, 70),
('발라카스의 단검', 'weapon', 'legendary', 'weapon', '{"str":30,"dex":35,"spd":40,"cri":5}', '용왕의 독기가 깃든 단검. [발라카스 세트]', 1, 20000, 70);

-- 악세서리 (A등급 재료)
INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level) VALUES
('발라카스의 반지', 'accessory', 'legendary', 'ring', '{"str":15,"int":15,"cri":3}', '용왕의 불꽃 반지. [발라카스 세트]', 1, 15000, 70),
('발라카스의 목걸이', 'accessory', 'legendary', 'amulet', '{"vit":20,"spd":25,"cri":2}', '용왕의 비늘 목걸이. [발라카스 세트]', 1, 15000, 70);

-- 방어구 (B등급 재료)
INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level) VALUES
('발라카스의 투구', 'armor', 'legendary', 'helm', '{"vit":30,"str":10,"int":10}', '용왕의 왕관. [발라카스 세트]', 1, 15000, 70),
('발라카스의 갑옷', 'armor', 'legendary', 'chest', '{"vit":40,"str":15,"int":15}', '용왕의 비늘 갑옷. [발라카스 세트]', 1, 15000, 70),
('발라카스의 장화', 'armor', 'legendary', 'boots', '{"spd":35,"dex":15,"vit":15}', '용왕의 발굽. [발라카스 세트]', 1, 15000, 70);

-- ========================================
-- 2. 카르나스 세트 아이템 (Lv.90)
-- ========================================

INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level) VALUES
('카르나스의 대검', 'weapon', 'legendary', 'weapon', '{"str":55,"vit":25,"spd":35}', '심연의 독기가 서린 대검. [카르나스 세트]', 1, 30000, 80),
('카르나스의 지팡이', 'weapon', 'legendary', 'weapon', '{"int":60,"vit":20,"spd":30}', '심연의 마력이 서린 지팡이. [카르나스 세트]', 1, 30000, 80),
('카르나스의 홀', 'weapon', 'legendary', 'weapon', '{"int":50,"vit":30,"spd":25}', '심연의 치유력이 서린 홀. [카르나스 세트]', 1, 30000, 80),
('카르나스의 단검', 'weapon', 'legendary', 'weapon', '{"str":35,"dex":45,"spd":50,"cri":6}', '심연의 맹독 단검. [카르나스 세트]', 1, 30000, 80);

INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level) VALUES
('카르나스의 반지', 'accessory', 'legendary', 'ring', '{"str":20,"int":20,"cri":4}', '히드라의 눈 반지. [카르나스 세트]', 1, 25000, 80),
('카르나스의 목걸이', 'accessory', 'legendary', 'amulet', '{"vit":25,"spd":30,"cri":3}', '히드라의 이빨 목걸이. [카르나스 세트]', 1, 25000, 80);

INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level) VALUES
('카르나스의 투구', 'armor', 'legendary', 'helm', '{"vit":35,"str":15,"int":15}', '히드라의 왕관. [카르나스 세트]', 1, 25000, 80),
('카르나스의 갑옷', 'armor', 'legendary', 'chest', '{"vit":50,"str":20,"int":20}', '히드라의 비늘 갑옷. [카르나스 세트]', 1, 25000, 80),
('카르나스의 장화', 'armor', 'legendary', 'boots', '{"spd":45,"dex":20,"vit":20}', '히드라의 발톱. [카르나스 세트]', 1, 25000, 80);

-- ========================================
-- 3. 아트라스 세트 아이템 (Lv.100)
-- ========================================

INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level) VALUES
('아트라스의 대검', 'weapon', 'legendary', 'weapon', '{"str":70,"vit":30,"spd":40}', '거신의 분노가 담긴 대검. [아트라스 세트]', 1, 50000, 90),
('아트라스의 지팡이', 'weapon', 'legendary', 'weapon', '{"int":75,"vit":25,"spd":35}', '거신의 지혜가 담긴 지팡이. [아트라스 세트]', 1, 50000, 90),
('아트라스의 홀', 'weapon', 'legendary', 'weapon', '{"int":65,"vit":35,"spd":30}', '거신의 축복이 담긴 홀. [아트라스 세트]', 1, 50000, 90),
('아트라스의 단검', 'weapon', 'legendary', 'weapon', '{"str":45,"dex":55,"spd":60,"cri":8}', '거신의 번개 단검. [아트라스 세트]', 1, 50000, 90);

INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level) VALUES
('아트라스의 반지', 'accessory', 'legendary', 'ring', '{"str":25,"int":25,"cri":5}', '거신의 눈 반지. [아트라스 세트]', 1, 40000, 90),
('아트라스의 목걸이', 'accessory', 'legendary', 'amulet', '{"vit":30,"spd":40,"cri":4}', '거신의 심장 목걸이. [아트라스 세트]', 1, 40000, 90);

INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level) VALUES
('아트라스의 투구', 'armor', 'legendary', 'helm', '{"vit":45,"str":20,"int":20}', '거신의 왕관. [아트라스 세트]', 1, 40000, 90),
('아트라스의 갑옷', 'armor', 'legendary', 'chest', '{"vit":60,"str":25,"int":25}', '거신의 흉갑. [아트라스 세트]', 1, 40000, 90),
('아트라스의 장화', 'armor', 'legendary', 'boots', '{"spd":55,"dex":25,"vit":25}', '거신의 각반. [아트라스 세트]', 1, 40000, 90);
