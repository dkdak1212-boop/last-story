-- =============================================
-- 세트 장비 스탯 리밸런스
-- 기준: 최상급 일반템 대비 10~30% 상승 + 세트효과 보너스
-- 무기: 대검=전사(atk), 지팡이=마법사(matk), 홀=성직자(matk+hp), 단검=도적(atk+cri)
-- =============================================

-- === 발라카스 세트 (Lv.70) === 기준: 상급 일반 (atk160/matk160, def54, hp320)
-- 무기
UPDATE items SET stats = '{"atk":200,"str":30,"vit":15,"spd":20,"hp":100}'::jsonb WHERE id = 293; -- 대검(전사)
UPDATE items SET stats = '{"matk":200,"int":35,"vit":10,"spd":15,"hp":80}'::jsonb WHERE id = 294; -- 지팡이(마법사)
UPDATE items SET stats = '{"matk":180,"int":25,"vit":20,"spd":15,"hp":120}'::jsonb WHERE id = 295; -- 홀(성직자)
UPDATE items SET stats = '{"atk":180,"dex":25,"spd":35,"cri":5,"hp":60}'::jsonb WHERE id = 296; -- 단검(도적)
-- 악세서리
UPDATE items SET stats = '{"atk":60,"matk":60,"str":10,"int":10,"cri":3}'::jsonb WHERE id = 297; -- 반지
UPDATE items SET stats = '{"hp":200,"def":40,"mdef":30,"spd":20,"cri":2}'::jsonb WHERE id = 298; -- 목걸이
-- 방어구
UPDATE items SET stats = '{"def":60,"mdef":40,"vit":20,"str":8,"int":8}'::jsonb WHERE id = 299; -- 투구
UPDATE items SET stats = '{"hp":400,"def":100,"mdef":50,"vit":25}'::jsonb WHERE id = 300; -- 갑옷
UPDATE items SET stats = '{"hp":200,"mdef":60,"spd":30,"dex":12}'::jsonb WHERE id = 301; -- 장화

-- === 카르나스 세트 (Lv.80) === 기준: 최상급 일반 (atk300/matk300, def102, hp600)
-- 무기
UPDATE items SET stats = '{"atk":350,"str":40,"vit":20,"spd":25,"hp":150}'::jsonb WHERE id = 302; -- 대검
UPDATE items SET stats = '{"matk":350,"int":45,"vit":15,"spd":20,"hp":100}'::jsonb WHERE id = 303; -- 지팡이
UPDATE items SET stats = '{"matk":320,"int":35,"vit":25,"spd":20,"hp":180}'::jsonb WHERE id = 304; -- 홀
UPDATE items SET stats = '{"atk":320,"dex":35,"spd":45,"cri":7,"hp":80}'::jsonb WHERE id = 305; -- 단검
-- 악세서리
UPDATE items SET stats = '{"atk":100,"matk":100,"str":15,"int":15,"cri":4}'::jsonb WHERE id = 306; -- 반지
UPDATE items SET stats = '{"hp":350,"def":70,"mdef":50,"spd":25,"cri":3}'::jsonb WHERE id = 307; -- 목걸이
-- 방어구
UPDATE items SET stats = '{"def":110,"mdef":75,"vit":28,"str":12,"int":12}'::jsonb WHERE id = 308; -- 투구
UPDATE items SET stats = '{"hp":700,"def":180,"mdef":90,"vit":35}'::jsonb WHERE id = 309; -- 갑옷
UPDATE items SET stats = '{"hp":400,"mdef":100,"spd":40,"dex":18}'::jsonb WHERE id = 310; -- 장화

-- === 아트라스 세트 (Lv.90) === 최상급 대비 30~50% 상승 (최종 장비)
-- 무기
UPDATE items SET stats = '{"atk":450,"str":50,"vit":25,"spd":30,"hp":200}'::jsonb WHERE id = 311; -- 대검
UPDATE items SET stats = '{"matk":450,"int":55,"vit":20,"spd":25,"hp":150}'::jsonb WHERE id = 312; -- 지팡이
UPDATE items SET stats = '{"matk":400,"int":45,"vit":30,"spd":25,"hp":250}'::jsonb WHERE id = 313; -- 홀
UPDATE items SET stats = '{"atk":400,"dex":45,"spd":55,"cri":10,"hp":100}'::jsonb WHERE id = 314; -- 단검
-- 악세서리
UPDATE items SET stats = '{"atk":140,"matk":140,"str":20,"int":20,"cri":6}'::jsonb WHERE id = 315; -- 반지
UPDATE items SET stats = '{"hp":500,"def":100,"mdef":70,"spd":35,"cri":4}'::jsonb WHERE id = 316; -- 목걸이
-- 방어구
UPDATE items SET stats = '{"def":150,"mdef":100,"vit":35,"str":16,"int":16}'::jsonb WHERE id = 317; -- 투구
UPDATE items SET stats = '{"hp":1000,"def":250,"mdef":130,"vit":45}'::jsonb WHERE id = 318; -- 갑옷
UPDATE items SET stats = '{"hp":550,"mdef":140,"spd":50,"dex":25}'::jsonb WHERE id = 319; -- 장화
