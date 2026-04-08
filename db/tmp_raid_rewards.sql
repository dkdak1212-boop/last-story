-- 히드라 카르나스 전용 재료
INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level)
VALUES
('카르나스의 독아', 'material', 'epic', NULL, NULL, '심연의 히드라에게서 얻은 맹독의 송곳니', 300, 3000, 1),
('카르나스의 심장', 'material', 'legendary', NULL, NULL, '심연의 히드라의 심장. 엄청난 마력이 깃들어 있다.', 300, 8000, 1),
('카르나스의 핵', 'material', 'legendary', NULL, NULL, '심연의 히드라의 핵. 최상급 제작 재료.', 300, 15000, 1);

-- 아트라스 전용 재료
INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level)
VALUES
('아트라스의 파편', 'material', 'epic', NULL, NULL, '천벌의 거신에게서 떨어진 신성한 파편', 300, 5000, 1),
('아트라스의 눈', 'material', 'legendary', NULL, NULL, '거신의 눈. 세계를 내려다보던 힘이 잔존한다.', 300, 12000, 1),
('아트라스의 심장', 'material', 'legendary', NULL, NULL, '거신의 심장. 전설을 넘어선 존재의 증거.', 300, 25000, 1);

-- ID 확인
SELECT id, name, grade FROM items WHERE name LIKE '카르나스%' OR name LIKE '아트라스%' ORDER BY id;
