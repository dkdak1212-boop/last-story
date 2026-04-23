-- 길드 보스 상자 아이템화 — 3종 신규 등록 (수령·개봉 분리)
-- 2026-04-23

BEGIN;

INSERT INTO items (name, type, grade, slot, description, stack_size, sell_price)
VALUES
  ('길드 보스 황금빛 상자', 'consumable', 'legendary', NULL,
   '개봉 시 대량의 골드·EXP·메달과 부스터 4종(EXP/Gold/Drop/HP +50%, 1시간), 잭팟 아이템을 획득합니다.',
   99, 0),
  ('길드 보스 은빛 상자', 'consumable', 'epic', NULL,
   '개봉 시 중량의 골드·EXP·메달과 부스터 4종(EXP/Gold/Drop/HP +50%, 1시간), 잭팟 아이템을 획득합니다.',
   99, 0),
  ('길드 보스 구리 상자', 'consumable', 'rare', NULL,
   '개봉 시 소량의 골드·EXP·메달과 부스터 1종(EXP +50%, 1시간)을 획득합니다.',
   99, 0)
ON CONFLICT DO NOTHING;

-- ID 확인용
SELECT id, name, type, grade, stack_size
FROM items
WHERE name IN ('길드 보스 황금빛 상자', '길드 보스 은빛 상자', '길드 보스 구리 상자')
ORDER BY name;

COMMIT;
