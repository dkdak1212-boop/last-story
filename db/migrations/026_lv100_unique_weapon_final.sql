-- Lv.100 유니크 무기 최종 수치 (원본 × 3.5)
BEGIN;

UPDATE items SET stats = jsonb_set(stats, '{atk}',  '1015', false) WHERE id = 800; -- 시공의 절단검
UPDATE items SET stats = jsonb_set(stats, '{atk}',   '945', false) WHERE id = 801; -- 무한 망각의 대검
UPDATE items SET stats = jsonb_set(stats, '{atk}',  '1068', false) WHERE id = 802; -- 차원 분쇄자
UPDATE items SET stats = jsonb_set(stats, '{matk}', '1068', false) WHERE id = 803; -- 시간의 종말
UPDATE items SET stats = jsonb_set(stats, '{matk}', '1015', false) WHERE id = 804; -- 무한 별의 지팡이
UPDATE items SET stats = jsonb_set(stats, '{matk}',  '980', false) WHERE id = 805; -- 차원 균열의 홀
UPDATE items SET stats = jsonb_set(stats, '{matk}',  '945', false) WHERE id = 806; -- 신성한 차원의 홀
UPDATE items SET stats = jsonb_set(stats, '{matk}',  '910', false) WHERE id = 807; -- 영원한 빛의 성구
UPDATE items SET stats = jsonb_set(stats, '{matk}',  '998', false) WHERE id = 808; -- 무한의 심판
UPDATE items SET stats = jsonb_set(stats, '{atk}',  '1033', false) WHERE id = 809; -- 그림자 차원의 단검
UPDATE items SET stats = jsonb_set(stats, '{atk}',   '980', false) WHERE id = 810; -- 시간 조각의 단검
UPDATE items SET stats = jsonb_set(stats, '{atk}',   '998', false) WHERE id = 811; -- 무한 독의 단검
UPDATE items SET stats = jsonb_set(stats, '{matk}',  '998', false) WHERE id = 812; -- 무한 소환의 보주
UPDATE items SET stats = jsonb_set(stats, '{matk}',  '945', false) WHERE id = 813; -- 차원 균열의 토템
UPDATE items SET stats = jsonb_set(stats, '{matk}', '1033', false) WHERE id = 814; -- 시공 소환술서

SELECT id, name,
       COALESCE((stats->>'atk')::int, 0) AS atk,
       COALESCE((stats->>'matk')::int, 0) AS matk
  FROM items
 WHERE id BETWEEN 800 AND 814
 ORDER BY id;

COMMIT;
