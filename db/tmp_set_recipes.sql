-- 세트 정의
INSERT INTO item_sets (name, boss_name, set_bonus_2, set_bonus_4, set_bonus_6, description) VALUES
('발라카스 세트', '태고의 용왕 발라카스',
 '{"str":10,"int":10,"vit":10}',
 '{"str":20,"int":20,"vit":20,"spd":30}',
 '{"str":35,"int":35,"vit":35,"spd":50,"cri":5}',
 '2세트: 힘/지/체+10 | 4세트: 힘/지/체+20, 속+30 | 6세트: 힘/지/체+35, 속+50, 치+5'),
('카르나스 세트', '심연의 히드라 카르나스',
 '{"str":15,"int":15,"vit":15}',
 '{"str":30,"int":30,"vit":30,"spd":40}',
 '{"str":50,"int":50,"vit":50,"spd":70,"cri":8}',
 '2세트: 힘/지/체+15 | 4세트: 힘/지/체+30, 속+40 | 6세트: 힘/지/체+50, 속+70, 치+8'),
('아트라스 세트', '천벌의 거신 아트라스',
 '{"str":20,"int":20,"vit":20}',
 '{"str":40,"int":40,"vit":40,"spd":50}',
 '{"str":70,"int":70,"vit":70,"spd":100,"cri":12}',
 '2세트: 힘/지/체+20 | 4세트: 힘/지/체+40, 속+50 | 6세트: 힘/지/체+70, 속+100, 치+12');

-- 세트 아이템에 set_id 연결 (items 테이블에 set_id 컬럼 추가)
ALTER TABLE items ADD COLUMN IF NOT EXISTS set_id INT REFERENCES item_sets(id);

UPDATE items SET set_id = 1 WHERE id BETWEEN 293 AND 301;
UPDATE items SET set_id = 2 WHERE id BETWEEN 302 AND 310;
UPDATE items SET set_id = 3 WHERE id BETWEEN 311 AND 319;

-- 조합 레시피: 발라카스
-- S등급(용왕의 핵 x3) → 무기 랜덤
INSERT INTO craft_recipes (name, material_item_id, material_qty, result_type, result_item_ids, set_id)
VALUES ('발라카스 무기 제작', 350, 3, 'weapon_random', '{293,294,295,296}', 1);
-- A등급(용왕의 결정 x3) → 악세 랜덤
INSERT INTO craft_recipes (name, material_item_id, material_qty, result_type, result_item_ids, set_id)
VALUES ('발라카스 악세서리 제작', 349, 3, 'accessory_random', '{297,298}', 1);
-- B등급(발라카스의 비늘 x3) → 방어구 랜덤
INSERT INTO craft_recipes (name, material_item_id, material_qty, result_type, result_item_ids, set_id)
VALUES ('발라카스 방어구 제작', 348, 3, 'armor_random', '{299,300,301}', 1);

-- 조합 레시피: 카르나스
INSERT INTO craft_recipes (name, material_item_id, material_qty, result_type, result_item_ids, set_id)
VALUES ('카르나스 무기 제작', 289, 3, 'weapon_random', '{302,303,304,305}', 2);
INSERT INTO craft_recipes (name, material_item_id, material_qty, result_type, result_item_ids, set_id)
VALUES ('카르나스 악세서리 제작', 288, 3, 'accessory_random', '{306,307}', 2);
INSERT INTO craft_recipes (name, material_item_id, material_qty, result_type, result_item_ids, set_id)
VALUES ('카르나스 방어구 제작', 287, 3, 'armor_random', '{308,309,310}', 2);

-- 조합 레시피: 아트라스
INSERT INTO craft_recipes (name, material_item_id, material_qty, result_type, result_item_ids, set_id)
VALUES ('아트라스 무기 제작', 292, 3, 'weapon_random', '{311,312,313,314}', 3);
INSERT INTO craft_recipes (name, material_item_id, material_qty, result_type, result_item_ids, set_id)
VALUES ('아트라스 악세서리 제작', 291, 3, 'accessory_random', '{315,316}', 3);
INSERT INTO craft_recipes (name, material_item_id, material_qty, result_type, result_item_ids, set_id)
VALUES ('아트라스 방어구 제작', 290, 3, 'armor_random', '{317,318,319}', 3);
