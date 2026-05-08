-- 087: 대소환사 (summoner_v2) — 4방향 노드 트리 (시공의 균열식 방사형)
-- 12시 신수화 (33pt) / 3시 정령화 (36pt) / 6시 괴수화 (36pt) / 9시 마도화 (38pt)
-- 임계치 = 한 방향의 모든 노드를 찍었을 때 누적 pt. 주요 노드(8pt) 도달 = 변환 활성.
-- 두 방향 모두 주요 노드 도달 시 — 나중 도달이 덮어쓰기 (engine 처리).

BEGIN;

-- ============================================================
-- 12시 신수화 (north_summoner_v2_holy) — 13 small + 6 medium + 1 large = 33pt
-- 컨셉: HP·재생·받피데감 (탱커형 — 수호수 변환)
-- ============================================================

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '신수 체력 ' || n, '체력 +5', 'north_summoner_v2_holy', 'small', 1, 'summoner_v2',
       '[{"type":"stat","stat":"vit","value":5}]', n+39, -15
FROM generate_series(1, 5) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '신수 가호 ' || n, 'HP +50', 'north_summoner_v2_holy', 'small', 1, 'summoner_v2',
       '[{"type":"passive","key":"hp_flat","value":50}]', n+39, -16
FROM generate_series(1, 5) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '신수 재생 ' || n, 'HP 재생 +1%/턴', 'north_summoner_v2_holy', 'small', 1, 'summoner_v2',
       '[{"type":"passive","key":"hp_regen_pct","value":1}]', n+39, -17
FROM generate_series(1, 3) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('신수 VIT 증강 I',   '체력 +12',                      'north_summoner_v2_holy', 'medium', 2, 'summoner_v2', '[{"type":"stat","stat":"vit","value":12}]', 40, -18),
('신수 VIT 증강 II',  '체력 +12',                      'north_summoner_v2_holy', 'medium', 2, 'summoner_v2', '[{"type":"stat","stat":"vit","value":12}]', 41, -18),
('신수 HP 증강',      'HP +200',                       'north_summoner_v2_holy', 'medium', 2, 'summoner_v2', '[{"type":"passive","key":"hp_flat","value":200}]', 42, -18),
('신수 재생 강화',    'HP 재생 +3%/턴',                 'north_summoner_v2_holy', 'medium', 2, 'summoner_v2', '[{"type":"passive","key":"hp_regen_pct","value":3}]', 43, -18),
('신수 실드 강화',    '실드 효과 +30%',                 'north_summoner_v2_holy', 'medium', 2, 'summoner_v2', '[{"type":"passive","key":"shield_amp","value":30}]', 44, -18),
('신수 받피감 강화',  '받는 피해 -8%',                  'north_summoner_v2_holy', 'medium', 2, 'summoner_v2', '[{"type":"passive","key":"damage_reduce_passive","value":8}]', 45, -18);

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('신수 강림', 'HP +500, 실드 효과 +30%, 받는 피해 -10%, 소환수 = 수호수 (특수기: 신수의 결박)', 'north_summoner_v2_holy', 'large', 8, 'summoner_v2',
 '[
   {"type":"passive","key":"summoner_v2_holy","value":1},
   {"type":"passive","key":"hp_flat","value":500},
   {"type":"passive","key":"shield_amp","value":30},
   {"type":"stat","stat":"vit","value":30}
 ]', 42, -20);

-- ============================================================
-- 3시 정령화 (north_summoner_v2_spirit) — 14 small + 7 medium + 1 large = 36pt
-- 컨셉: 데미지·속도 (속공/딜 — 뇌신 변환)
-- ============================================================

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '정령 지능 ' || n, '지능 +5', 'north_summoner_v2_spirit', 'small', 1, 'summoner_v2',
       '[{"type":"stat","stat":"int","value":5}]', n+49, -15
FROM generate_series(1, 5) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '정령 신속 ' || n, '스피드 +15', 'north_summoner_v2_spirit', 'small', 1, 'summoner_v2',
       '[{"type":"stat","stat":"spd","value":15}]', n+49, -16
FROM generate_series(1, 5) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '정령 진동 ' || n, '소환수 데미지 +3%', 'north_summoner_v2_spirit', 'small', 1, 'summoner_v2',
       '[{"type":"passive","key":"summon_amp","value":3}]', n+49, -17
FROM generate_series(1, 4) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('정령 INT 증강 I',   '지능 +12',                      'north_summoner_v2_spirit', 'medium', 2, 'summoner_v2', '[{"type":"stat","stat":"int","value":12}]', 50, -18),
('정령 INT 증강 II',  '지능 +12',                      'north_summoner_v2_spirit', 'medium', 2, 'summoner_v2', '[{"type":"stat","stat":"int","value":12}]', 51, -18),
('정령 SPD 증강 I',   '스피드 +50',                    'north_summoner_v2_spirit', 'medium', 2, 'summoner_v2', '[{"type":"stat","stat":"spd","value":50}]', 52, -18),
('정령 SPD 증강 II',  '스피드 +50',                    'north_summoner_v2_spirit', 'medium', 2, 'summoner_v2', '[{"type":"stat","stat":"spd","value":50}]', 53, -18),
('정령 진폭 강화',    '소환수 데미지 +12%',             'north_summoner_v2_spirit', 'medium', 2, 'summoner_v2', '[{"type":"passive","key":"summon_amp","value":12}]', 54, -18),
('정령 결속',         '소환수 데미지 +12%',             'north_summoner_v2_spirit', 'medium', 2, 'summoner_v2', '[{"type":"passive","key":"summon_amp","value":12}]', 55, -18),
('정령 가속',         '스피드 +60',                    'north_summoner_v2_spirit', 'medium', 2, 'summoner_v2', '[{"type":"stat","stat":"spd","value":60}]', 56, -18);

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('정령 동조', '소환수 데미지 +25%, 스피드 +150, INT +30, 소환수 = 뇌신 (특수기: 연쇄 번개)', 'north_summoner_v2_spirit', 'large', 8, 'summoner_v2',
 '[
   {"type":"passive","key":"summoner_v2_spirit","value":1},
   {"type":"passive","key":"summon_amp","value":25},
   {"type":"stat","stat":"spd","value":150},
   {"type":"stat","stat":"int","value":30}
 ]', 53, -20);

-- ============================================================
-- 6시 괴수화 (north_summoner_v2_beast) — 14 small + 7 medium + 1 large = 36pt
-- 컨셉: 데미지·치명타·회피 (한방/딜 — 대악마 변환)
-- ============================================================

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '괴수 흉포 ' || n, '치명타 확률 +3%', 'north_summoner_v2_beast', 'small', 1, 'summoner_v2',
       '[{"type":"stat","stat":"cri","value":3}]', n+59, -15
FROM generate_series(1, 5) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '괴수 야성 ' || n, '민첩 +5', 'north_summoner_v2_beast', 'small', 1, 'summoner_v2',
       '[{"type":"stat","stat":"dex","value":5}]', n+59, -16
FROM generate_series(1, 5) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '괴수 분노 ' || n, '소환수 데미지 +3%', 'north_summoner_v2_beast', 'small', 1, 'summoner_v2',
       '[{"type":"passive","key":"summon_amp","value":3}]', n+59, -17
FROM generate_series(1, 4) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('괴수 치명 증강 I',   '치명타 확률 +8%',                  'north_summoner_v2_beast', 'medium', 2, 'summoner_v2', '[{"type":"stat","stat":"cri","value":8}]', 60, -18),
('괴수 치명 증강 II',  '치명타 확률 +8%',                  'north_summoner_v2_beast', 'medium', 2, 'summoner_v2', '[{"type":"stat","stat":"cri","value":8}]', 61, -18),
('괴수 치명타 강화',   '치명타 데미지 +30%',                'north_summoner_v2_beast', 'medium', 2, 'summoner_v2', '[{"type":"passive","key":"crit_dmg_amp","value":30}]', 62, -18),
('괴수 폭증',          '소환수 데미지 +12%',                'north_summoner_v2_beast', 'medium', 2, 'summoner_v2', '[{"type":"passive","key":"summon_amp","value":12}]', 63, -18),
('괴수 폭격',          '소환수 데미지 +12%',                'north_summoner_v2_beast', 'medium', 2, 'summoner_v2', '[{"type":"passive","key":"summon_amp","value":12}]', 64, -18),
('괴수 회피 강화',     '민첩 +20',                          'north_summoner_v2_beast', 'medium', 2, 'summoner_v2', '[{"type":"stat","stat":"dex","value":20}]', 65, -18),
('괴수 분쇄',          '치명타 데미지 +30%',                'north_summoner_v2_beast', 'medium', 2, 'summoner_v2', '[{"type":"passive","key":"crit_dmg_amp","value":30}]', 66, -18);

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('괴수 폭주', '소환수 데미지 +30%, 치명타 +15, DEX +30, 소환수 = 대악마 (특수기: 지옥불 일격)', 'north_summoner_v2_beast', 'large', 8, 'summoner_v2',
 '[
   {"type":"passive","key":"summoner_v2_beast","value":1},
   {"type":"passive","key":"summon_amp","value":30},
   {"type":"stat","stat":"cri","value":15},
   {"type":"stat","stat":"dex","value":30}
 ]', 63, -20);

-- ============================================================
-- 9시 마도화 (north_summoner_v2_arcane) — 16 small + 7 medium + 1 large = 38pt
-- 컨셉: 술식 지속·INT (유틸 — 천상의 수호자 변환)
-- ============================================================

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '마도 지능 ' || n, '지능 +5', 'north_summoner_v2_arcane', 'small', 1, 'summoner_v2',
       '[{"type":"stat","stat":"int","value":5}]', n+69, -15
FROM generate_series(1, 6) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '마도 회로 ' || n, '소환수 데미지 +3%', 'north_summoner_v2_arcane', 'small', 1, 'summoner_v2',
       '[{"type":"passive","key":"summon_amp","value":3}]', n+69, -16
FROM generate_series(1, 5) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '마도 정신 ' || n, '체력 +5', 'north_summoner_v2_arcane', 'small', 1, 'summoner_v2',
       '[{"type":"stat","stat":"vit","value":5}]', n+69, -17
FROM generate_series(1, 5) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('마도 INT 증강 I',   '지능 +12',                      'north_summoner_v2_arcane', 'medium', 2, 'summoner_v2', '[{"type":"stat","stat":"int","value":12}]', 70, -18),
('마도 INT 증강 II',  '지능 +12',                      'north_summoner_v2_arcane', 'medium', 2, 'summoner_v2', '[{"type":"stat","stat":"int","value":12}]', 71, -18),
('마도 INT 증강 III', '지능 +15',                      'north_summoner_v2_arcane', 'medium', 2, 'summoner_v2', '[{"type":"stat","stat":"int","value":15}]', 72, -18),
('마도 술식 강화 I',  '소환수 데미지 +12%',             'north_summoner_v2_arcane', 'medium', 2, 'summoner_v2', '[{"type":"passive","key":"summon_amp","value":12}]', 73, -18),
('마도 술식 강화 II', '소환수 데미지 +12%',             'north_summoner_v2_arcane', 'medium', 2, 'summoner_v2', '[{"type":"passive","key":"summon_amp","value":12}]', 74, -18),
('마도 술식 지속',    '버프/디버프 지속 +1행동',         'north_summoner_v2_arcane', 'medium', 2, 'summoner_v2', '[{"type":"passive","key":"buff_extend","value":1}]', 75, -18),
('마도 시야',         '치명타 데미지 +15%',              'north_summoner_v2_arcane', 'medium', 2, 'summoner_v2', '[{"type":"passive","key":"crit_dmg_amp","value":15}]', 76, -18);

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('마도 초월', '버프 지속 +1행동, INT +50, 소환수 데미지 +20%, 소환수 = 천상의 수호자 (특수기: 천상의 심판)', 'north_summoner_v2_arcane', 'large', 8, 'summoner_v2',
 '[
   {"type":"passive","key":"summoner_v2_arcane","value":1},
   {"type":"passive","key":"buff_extend","value":1},
   {"type":"passive","key":"summon_amp","value":20},
   {"type":"stat","stat":"int","value":50}
 ]', 73, -20);

-- ============================================================
-- prerequisite 체인 자동 연결 — 016 마이그레이션과 동일 패턴
-- 같은 zone 내에서 small → medium → large 순서로 그물망 연결
-- ============================================================
DO $$
DECLARE
  z TEXT;
  smalls INT[];
  mediums INT[];
  larges INT[];
  i INT;
BEGIN
  FOR z IN
    SELECT DISTINCT zone FROM node_definitions
    WHERE zone IN ('north_summoner_v2_holy', 'north_summoner_v2_spirit', 'north_summoner_v2_beast', 'north_summoner_v2_arcane')
    ORDER BY zone
  LOOP
    SELECT array_agg(id ORDER BY id) INTO smalls FROM node_definitions WHERE zone = z AND tier = 'small';
    SELECT array_agg(id ORDER BY id) INTO mediums FROM node_definitions WHERE zone = z AND tier = 'medium';
    SELECT array_agg(id ORDER BY id) INTO larges  FROM node_definitions WHERE zone = z AND tier = 'large';

    -- small 체인: 3개 그룹마다 이전 그룹 마지막에 연결
    IF smalls IS NOT NULL THEN
      FOR i IN 1..array_length(smalls, 1) LOOP
        IF i > 3 THEN
          UPDATE node_definitions SET prerequisites = ARRAY[smalls[i - 3]] WHERE id = smalls[i];
        ELSIF i > 1 AND (i - 1) % 3 = 0 THEN
          UPDATE node_definitions SET prerequisites = ARRAY[smalls[i - 1]] WHERE id = smalls[i];
        END IF;
      END LOOP;
    END IF;

    -- medium: 소형 N개마다 1 medium
    IF mediums IS NOT NULL AND smalls IS NOT NULL AND array_length(smalls, 1) >= 3 THEN
      FOR i IN 1..array_length(mediums, 1) LOOP
        IF i <= array_length(smalls, 1) / 3 THEN
          UPDATE node_definitions SET prerequisites = ARRAY[smalls[LEAST(i * 3, array_length(smalls, 1))]] WHERE id = mediums[i];
        ELSE
          UPDATE node_definitions SET prerequisites = ARRAY[mediums[i - 1]] WHERE id = mediums[i];
        END IF;
      END LOOP;
    END IF;

    -- large (주요 노드): 모든 medium 의 마지막을 선행으로
    IF larges IS NOT NULL AND mediums IS NOT NULL AND array_length(mediums, 1) >= 1 THEN
      FOR i IN 1..array_length(larges, 1) LOOP
        UPDATE node_definitions
        SET prerequisites = ARRAY[mediums[array_length(mediums, 1)]]
        WHERE id = larges[i];
      END LOOP;
    END IF;
  END LOOP;
END $$;

COMMIT;
