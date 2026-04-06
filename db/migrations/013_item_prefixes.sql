-- v0.8.3: 아이템 접두사 시스템
BEGIN;

-- 접두사 정의 테이블
CREATE TABLE IF NOT EXISTS item_prefixes (
  id       SERIAL PRIMARY KEY,
  name     VARCHAR(20) NOT NULL,
  tier     INTEGER NOT NULL,        -- 1~4단계
  stat_key VARCHAR(10) NOT NULL,    -- str, dex, int, vit, spd, cri, dodge, accuracy
  min_val  INTEGER NOT NULL,
  max_val  INTEGER NOT NULL
);

-- 인벤토리/장착에 접두사 ID 배열 추가
ALTER TABLE character_inventory ADD COLUMN IF NOT EXISTS prefix_ids INTEGER[] DEFAULT '{}';
ALTER TABLE character_equipped  ADD COLUMN IF NOT EXISTS prefix_ids INTEGER[] DEFAULT '{}';

-- ===== 접두사 시드 데이터 =====
-- 6개 주요 스탯 × 4등급 = 24종
-- + 명중/회피 각 4등급 = 8종 → 총 32종

-- 힘 (str)
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('강인한',   1, 'str', 2, 4),
('용맹한',   2, 'str', 5, 8),
('압도적인', 3, 'str', 9, 14),
('전설의',   4, 'str', 15, 22);

-- 민첩 (dex)
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('날렵한',     1, 'dex', 2, 4),
('민활한',     2, 'dex', 5, 8),
('신출귀몰',   3, 'dex', 9, 14),
('초월한',     4, 'dex', 15, 22);

-- 지능 (int)
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('총명한',   1, 'int', 2, 4),
('현명한',   2, 'int', 5, 8),
('천재적인', 3, 'int', 9, 14),
('깨달은',   4, 'int', 15, 22);

-- 체력 (vit)
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('건장한',   1, 'vit', 2, 4),
('굳건한',   2, 'vit', 5, 8),
('불굴의',   3, 'vit', 9, 14),
('영원한',   4, 'vit', 15, 22);

-- 스피드 (spd)
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('재빠른',   1, 'spd', 2, 4),
('질풍의',   2, 'spd', 5, 8),
('번개의',   3, 'spd', 9, 14),
('섬광의',   4, 'spd', 15, 22);

-- 치명타 (cri)
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('예리한',   1, 'cri', 1, 2),
('치명적인', 2, 'cri', 3, 5),
('파멸적인', 3, 'cri', 6, 9),
('숙명적인', 4, 'cri', 10, 14);

-- 명중 (accuracy) - 민첩 계열 파생
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('정밀한',   1, 'accuracy', 2, 4),
('정확한',   2, 'accuracy', 5, 9),
('백발백중', 3, 'accuracy', 10, 16),
('필중의',   4, 'accuracy', 17, 25);

-- 회피 (dodge) - 민첩 계열 파생
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('회피하는',   1, 'dodge', 1, 3),
('유연한',     2, 'dodge', 4, 7),
('환영의',     3, 'dodge', 8, 12),
('무영의',     4, 'dodge', 13, 18);

COMMIT;
