-- v0.9.5 패치 마이그레이션

-- 1. 자동물약 설정 DB 영구 저장
ALTER TABLE characters ADD COLUMN IF NOT EXISTS auto_potion_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS auto_potion_threshold INT DEFAULT 30;

-- 2. 자동분해 설정
ALTER TABLE characters ADD COLUMN IF NOT EXISTS auto_dismantle_common BOOLEAN DEFAULT FALSE;

-- 3. 스택 사이즈 300으로 증가 (소비/재료 아이템)
UPDATE items SET stack_size = 300 WHERE stack_size > 1 AND stack_size < 300;

-- 4. 강화 성공률 상승 스크롤 아이템 추가
INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level)
VALUES (
  '강화 성공률 스크롤',
  'consumable',
  'rare',
  NULL,
  NULL,
  '사용 시 다음 강화의 성공 확률이 10% 증가합니다.',
  300,
  500,
  1
) ON CONFLICT DO NOTHING;

-- 5. 강화 최대 레벨 20으로 확장 (기존 check 제약 제거, 없으면 무시)
-- No constraint to drop - the limit was in code only
