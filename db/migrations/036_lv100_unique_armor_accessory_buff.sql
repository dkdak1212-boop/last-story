-- Lv.100 유니크 방어구 + 악세서리 기본 스탯 버프
-- 일반(신화) 대비 +30% 수준으로 재조정 (무기 버프와 격차 맞춤)
-- Slot 목표 기본 스탯:
--   helm  HP 3200 / DEF 230
--   chest HP 5330 / DEF 460
--   legs  HP 3200 / DEF 230  (helm과 동일 라인)
--   boots HP 2130 / DEF 215
--   amulet HP 2100 / ATK·MATK 320 / DEF 205
--   ring   HP 1480 / ATK·MATK 230 / DEF 150
-- 2026-04-22

BEGIN;

-- === HELMS (목표 HP 3200 / DEF 230) ===
UPDATE items SET stats = '{"hp": 3200, "def": 230, "int": 28}'::jsonb              WHERE id = 815; -- 무한 명상의 투구
UPDATE items SET stats = '{"hp": 3200, "def": 230}'::jsonb                           WHERE id = 816; -- 시공 수호자의 투구
UPDATE items SET stats = '{"hp": 3200, "atk": 180, "def": 230, "matk": 180}'::jsonb  WHERE id = 817; -- 차원의 왕관 (하이브리드)
UPDATE items SET stats = '{"hp": 3200, "cri": 10, "def": 230}'::jsonb                WHERE id = 818; -- 영원의 면류관

-- === CHESTS (목표 HP 5330 / DEF 460) ===
UPDATE items SET stats = '{"hp": 5330, "def": 460}'::jsonb                           WHERE id = 819; -- 무한 차원의 망토
UPDATE items SET stats = '{"hp": 5330, "def": 460}'::jsonb                           WHERE id = 820; -- 시공 사도의 갑옷
UPDATE items SET stats = '{"hp": 5330, "def": 460, "matk": 180}'::jsonb              WHERE id = 821; -- 차원 직조자의 의복 (매탁 플레이버)
UPDATE items SET stats = '{"hp": 5330, "def": 460}'::jsonb                           WHERE id = 822; -- 영원불멸의 갑주

-- === LEGS (목표 HP 3200 / DEF 230) ===
UPDATE items SET stats = '{"hp": 3200, "def": 230, "spd": 80}'::jsonb                WHERE id = 823; -- 무한 도약의 각반
UPDATE items SET stats = '{"hp": 3200, "def": 230, "dex": 28}'::jsonb                WHERE id = 824; -- 시공 보행의 각반
UPDATE items SET stats = '{"hp": 3200, "def": 230, "vit": 32}'::jsonb                WHERE id = 825; -- 차원 균열의 각반
UPDATE items SET stats = '{"hp": 3200, "cri": 10, "def": 230}'::jsonb                WHERE id = 826; -- 영원의 무릎보호대

-- === BOOTS (목표 HP 2130 / DEF 215) ===
UPDATE items SET stats = '{"hp": 2130, "def": 215, "spd": 100}'::jsonb               WHERE id = 827; -- 무한 질주의 신발
UPDATE items SET stats = '{"hp": 2130, "def": 215, "dex": 28}'::jsonb                WHERE id = 828; -- 시공 침투자의 부츠
UPDATE items SET stats = '{"hp": 2130, "def": 215, "vit": 25}'::jsonb                WHERE id = 829; -- 차원 보행의 장화
UPDATE items SET stats = '{"hp": 2130, "cri": 10, "def": 215}'::jsonb                WHERE id = 830; -- 영원 군주의 장화

-- === AMULETS (목표 HP 2100 / ATK·MATK 320 / DEF 205) ===
UPDATE items SET stats = '{"hp": 2100, "atk": 320, "def": 205, "matk": 320}'::jsonb  WHERE id = 831; -- 무한의 인장
UPDATE items SET stats = '{"hp": 2100, "atk": 320, "def": 205, "matk": 320}'::jsonb  WHERE id = 832; -- 시공의 목걸이
UPDATE items SET stats = '{"hp": 2100, "atk": 320, "def": 205, "matk": 320}'::jsonb  WHERE id = 833; -- 차원의 별
UPDATE items SET stats = '{"hp": 2100, "atk": 320, "def": 205, "matk": 320}'::jsonb  WHERE id = 834; -- 영원의 부적

-- === RINGS (목표 HP 1480 / ATK·MATK 230 / DEF 150) ===
UPDATE items SET stats = '{"hp": 1480, "atk": 230, "def": 150, "matk": 230}'::jsonb  WHERE id = 835; -- 무한의 반지
UPDATE items SET stats = '{"hp": 1480, "atk": 230, "def": 150, "matk": 230}'::jsonb  WHERE id = 836; -- 시공의 인장반지
UPDATE items SET stats = '{"hp": 1480, "atk": 230, "def": 150, "matk": 230}'::jsonb  WHERE id = 837; -- 차원 균열의 반지
UPDATE items SET stats = '{"hp": 1480, "atk": 230, "def": 150, "matk": 230}'::jsonb  WHERE id = 838; -- 영원의 봉인반지

-- 확인
SELECT id, name, slot, stats
FROM items
WHERE id BETWEEN 815 AND 838
ORDER BY CASE slot
  WHEN 'helm' THEN 1 WHEN 'chest' THEN 2 WHEN 'legs' THEN 3 WHEN 'boots' THEN 4
  WHEN 'amulet' THEN 5 WHEN 'ring' THEN 6 END, id;

COMMIT;
