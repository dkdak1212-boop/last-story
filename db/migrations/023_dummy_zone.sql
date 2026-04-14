-- 허수아비 존: 딜 체크용 불사 몬스터 + 전용 사냥터
BEGIN;

-- 5개 레벨의 허수아비 (모든 스탯 0, 보상 0, 거의 무한 HP)
-- stats: spd=0 → 절대 공격 안 함, vit=0 → def=0, int=0 → mdef=0
INSERT INTO monsters (name, level, max_hp, exp_reward, gold_reward, stats, drop_table, avg_kill_time_sec) VALUES
('허수아비 Lv.10',  10,  2000000000, 0, 0, '{"str":0,"dex":0,"int":0,"vit":0,"spd":0,"cri":0}', '[]', 999),
('허수아비 Lv.30',  30,  2000000000, 0, 0, '{"str":0,"dex":0,"int":0,"vit":0,"spd":0,"cri":0}', '[]', 999),
('허수아비 Lv.50',  50,  2000000000, 0, 0, '{"str":0,"dex":0,"int":0,"vit":0,"spd":0,"cri":0}', '[]', 999),
('허수아비 Lv.70',  70,  2000000000, 0, 0, '{"str":0,"dex":0,"int":0,"vit":0,"spd":0,"cri":0}', '[]', 999),
('허수아비 Lv.100', 100, 2000000000, 0, 0, '{"str":0,"dex":0,"int":0,"vit":0,"spd":0,"cri":0}', '[]', 999)
ON CONFLICT DO NOTHING;

-- 허수아비 존 필드 (required_level=1 — 누구나 입장 가능)
-- monster_pool은 직전 INSERT에서 생성된 id를 동적으로 채움
DO $$
DECLARE
  d10 INT; d30 INT; d50 INT; d70 INT; d100 INT;
BEGIN
  SELECT id INTO d10  FROM monsters WHERE name='허수아비 Lv.10'  LIMIT 1;
  SELECT id INTO d30  FROM monsters WHERE name='허수아비 Lv.30'  LIMIT 1;
  SELECT id INTO d50  FROM monsters WHERE name='허수아비 Lv.50'  LIMIT 1;
  SELECT id INTO d70  FROM monsters WHERE name='허수아비 Lv.70'  LIMIT 1;
  SELECT id INTO d100 FROM monsters WHERE name='허수아비 Lv.100' LIMIT 1;

  INSERT INTO fields (name, required_level, monster_pool, description) VALUES
  ('허수아비 존 Lv.10',  1, to_jsonb(ARRAY[d10]),  '딜 체크용. 허수아비는 절대 죽지 않고 공격하지 않으며 보상도 없습니다.'),
  ('허수아비 존 Lv.30',  1, to_jsonb(ARRAY[d30]),  '딜 체크용. 허수아비는 절대 죽지 않고 공격하지 않으며 보상도 없습니다.'),
  ('허수아비 존 Lv.50',  1, to_jsonb(ARRAY[d50]),  '딜 체크용. 허수아비는 절대 죽지 않고 공격하지 않으며 보상도 없습니다.'),
  ('허수아비 존 Lv.70',  1, to_jsonb(ARRAY[d70]),  '딜 체크용. 허수아비는 절대 죽지 않고 공격하지 않으며 보상도 없습니다.'),
  ('허수아비 존 Lv.100', 1, to_jsonb(ARRAY[d100]), '딜 체크용. 허수아비는 절대 죽지 않고 공격하지 않으며 보상도 없습니다.')
  ON CONFLICT DO NOTHING;
END $$;

COMMIT;
