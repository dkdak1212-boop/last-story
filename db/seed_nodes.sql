-- 노드 트리 시드 데이터 (302개)
-- 구조: 기본(남)38 + 공격(동)38 + 유틸(서)38 + 중앙20 + 직업고유(북)168 = 302

BEGIN;

TRUNCATE node_definitions CASCADE;

-- ============================================================
-- 공용 기본존 (남) — 38개
-- 소형 30개 + 중형 8개
-- ============================================================

-- 소형: HP+50 ×6
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('체력 강화 I',   'HP +50', 'south', 'small', 1, '[{"type":"stat","stat":"vit","value":5}]', 0, 0),
('체력 강화 II',  'HP +50', 'south', 'small', 1, '[{"type":"stat","stat":"vit","value":5}]', 1, 0),
('체력 강화 III', 'HP +50', 'south', 'small', 1, '[{"type":"stat","stat":"vit","value":5}]', 2, 0),
('체력 강화 IV',  'HP +50', 'south', 'small', 1, '[{"type":"stat","stat":"vit","value":5}]', 3, 0),
('체력 강화 V',   'HP +50', 'south', 'small', 1, '[{"type":"stat","stat":"vit","value":5}]', 4, 0),
('체력 강화 VI',  'HP +50', 'south', 'small', 1, '[{"type":"stat","stat":"vit","value":5}]', 5, 0);

-- 소형: 방어력+6 ×6
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('방어 강화 I',   '방어력 +6', 'south', 'small', 1, '[{"type":"stat","stat":"vit","value":3}]', 0, 1),
('방어 강화 II',  '방어력 +6', 'south', 'small', 1, '[{"type":"stat","stat":"vit","value":3}]', 1, 1),
('방어 강화 III', '방어력 +6', 'south', 'small', 1, '[{"type":"stat","stat":"vit","value":3}]', 2, 1),
('방어 강화 IV',  '방어력 +6', 'south', 'small', 1, '[{"type":"stat","stat":"vit","value":3}]', 3, 1),
('방어 강화 V',   '방어력 +6', 'south', 'small', 1, '[{"type":"stat","stat":"vit","value":3}]', 4, 1),
('방어 강화 VI',  '방어력 +6', 'south', 'small', 1, '[{"type":"stat","stat":"vit","value":3}]', 5, 1);

-- 소형: 스피드+15 ×6
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('신속 강화 I',   '스피드 +15', 'south', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', 0, 2),
('신속 강화 II',  '스피드 +15', 'south', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', 1, 2),
('신속 강화 III', '스피드 +15', 'south', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', 2, 2),
('신속 강화 IV',  '스피드 +15', 'south', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', 3, 2),
('신속 강화 V',   '스피드 +15', 'south', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', 4, 2),
('신속 강화 VI',  '스피드 +15', 'south', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', 5, 2);

-- 소형: 공격력+8 ×6
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('힘 강화 I',   '공격력 +8', 'south', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 0, 3),
('힘 강화 II',  '공격력 +8', 'south', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 1, 3),
('힘 강화 III', '공격력 +8', 'south', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 2, 3),
('힘 강화 IV',  '공격력 +8', 'south', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 3, 3),
('힘 강화 V',   '공격력 +8', 'south', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 4, 3),
('힘 강화 VI',  '공격력 +8', 'south', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 5, 3);

-- 소형: 치명타확률+3% ×3
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('치명 강화 I',  '치명타 확률 +3%', 'south', 'small', 1, '[{"type":"stat","stat":"cri","value":3}]', 0, 4),
('치명 강화 II', '치명타 확률 +3%', 'south', 'small', 1, '[{"type":"stat","stat":"cri","value":3}]', 1, 4),
('치명 강화 III','치명타 확률 +3%', 'south', 'small', 1, '[{"type":"stat","stat":"cri","value":3}]', 2, 4);

-- 소형: 치명타데미지+10% ×3
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('치명 피해 I',  '치명타 데미지 +10%', 'south', 'small', 1, '[{"type":"passive","key":"crit_damage","value":10}]', 3, 4),
('치명 피해 II', '치명타 데미지 +10%', 'south', 'small', 1, '[{"type":"passive","key":"crit_damage","value":10}]', 4, 4),
('치명 피해 III','치명타 데미지 +10%', 'south', 'small', 1, '[{"type":"passive","key":"crit_damage","value":10}]', 5, 4);

-- 중형 8개
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('수호 본능',    'HP 40% 이하 시 방어력 +25%',    'south', 'medium', 2, '[{"type":"passive","key":"guard_instinct","value":25}]', 0, 5),
('철갑 돌파',    '적 방어력 무시 15%',             'south', 'medium', 2, '[{"type":"passive","key":"armor_pierce","value":15}]', 1, 5),
('도트 저항',    '도트 저항 +15%',                 'south', 'medium', 2, '[{"type":"passive","key":"dot_resist","value":15}]', 2, 5),
('HP 증강',      'HP +200',                        'south', 'medium', 2, '[{"type":"stat","stat":"vit","value":20}]', 3, 5),
('방어 증강',    '방어력 +25',                     'south', 'medium', 2, '[{"type":"stat","stat":"vit","value":12}]', 4, 5),
('신속 증강',    '스피드 +60',                     'south', 'medium', 2, '[{"type":"stat","stat":"spd","value":60}]', 5, 5),
('공격 증강',    '공격력 +30',                     'south', 'medium', 2, '[{"type":"stat","stat":"str","value":15}]', 2, 6),
('치명 증강',    '치명타 확률 +10%',               'south', 'medium', 2, '[{"type":"stat","stat":"cri","value":10}]', 3, 6);

-- ============================================================
-- 공격존 (동) — 38개
-- 소형 30개 + 중형 8개
-- ============================================================

-- 소형: 공격력+8 ×10
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('맹공 I',   '공격력 +8', 'east', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 10, 0),
('맹공 II',  '공격력 +8', 'east', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 11, 0),
('맹공 III', '공격력 +8', 'east', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 12, 0),
('맹공 IV',  '공격력 +8', 'east', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 13, 0),
('맹공 V',   '공격력 +8', 'east', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 10, 1),
('맹공 VI',  '공격력 +8', 'east', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 11, 1),
('맹공 VII', '공격력 +8', 'east', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 12, 1),
('맹공 VIII','공격력 +8', 'east', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 13, 1),
('맹공 IX',  '공격력 +8', 'east', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 10, 2),
('맹공 X',   '공격력 +8', 'east', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 11, 2);

-- 소형: 치명타확률+3% ×6
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('일격 I',  '치명타 확률 +3%', 'east', 'small', 1, '[{"type":"stat","stat":"cri","value":3}]', 12, 2),
('일격 II', '치명타 확률 +3%', 'east', 'small', 1, '[{"type":"stat","stat":"cri","value":3}]', 13, 2),
('일격 III','치명타 확률 +3%', 'east', 'small', 1, '[{"type":"stat","stat":"cri","value":3}]', 10, 3),
('일격 IV', '치명타 확률 +3%', 'east', 'small', 1, '[{"type":"stat","stat":"cri","value":3}]', 11, 3),
('일격 V',  '치명타 확률 +3%', 'east', 'small', 1, '[{"type":"stat","stat":"cri","value":3}]', 12, 3),
('일격 VI', '치명타 확률 +3%', 'east', 'small', 1, '[{"type":"stat","stat":"cri","value":3}]', 13, 3);

-- 소형: 치명타데미지+10% ×6
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('파멸 I',  '치명타 데미지 +10%', 'east', 'small', 1, '[{"type":"passive","key":"crit_damage","value":10}]', 10, 4),
('파멸 II', '치명타 데미지 +10%', 'east', 'small', 1, '[{"type":"passive","key":"crit_damage","value":10}]', 11, 4),
('파멸 III','치명타 데미지 +10%', 'east', 'small', 1, '[{"type":"passive","key":"crit_damage","value":10}]', 12, 4),
('파멸 IV', '치명타 데미지 +10%', 'east', 'small', 1, '[{"type":"passive","key":"crit_damage","value":10}]', 13, 4),
('파멸 V',  '치명타 데미지 +10%', 'east', 'small', 1, '[{"type":"passive","key":"crit_damage","value":10}]', 10, 5),
('파멸 VI', '치명타 데미지 +10%', 'east', 'small', 1, '[{"type":"passive","key":"crit_damage","value":10}]', 11, 5);

-- 소형: 스피드+15 ×8
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('가속 I',  '스피드 +15', 'east', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', 12, 5),
('가속 II', '스피드 +15', 'east', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', 13, 5),
('가속 III','스피드 +15', 'east', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', 10, 6),
('가속 IV', '스피드 +15', 'east', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', 11, 6),
('가속 V',  '스피드 +15', 'east', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', 12, 6),
('가속 VI', '스피드 +15', 'east', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', 13, 6),
('가속 VII','스피드 +15', 'east', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', 10, 7),
('가속 VIII','스피드 +15', 'east', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', 11, 7);

-- 중형 8개
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('출혈의 검',   '물리 공격 시 3행동 출혈 도트',        'east', 'medium', 2, '[{"type":"passive","key":"bleed_on_hit","value":3}]', 12, 7),
('마력 증폭',   '스킬 후 다음 스킬 데미지 +20%',      'east', 'medium', 2, '[{"type":"passive","key":"spell_amp","value":20}]', 13, 7),
('신속의 발',   '쿨타임 1행동 감소',                   'east', 'medium', 2, '[{"type":"passive","key":"cooldown_reduce","value":1}]', 10, 8),
('흡혈 본능',   '치명타 발생 시 HP 5% 회복',           'east', 'medium', 2, '[{"type":"passive","key":"crit_lifesteal","value":5}]', 11, 8),
('공격 증강 II','공격력 +30',                          'east', 'medium', 2, '[{"type":"stat","stat":"str","value":15}]', 12, 8),
('공격 증강 III','공격력 +30',                         'east', 'medium', 2, '[{"type":"stat","stat":"str","value":15}]', 13, 8),
('치명 증강 II','치명타 확률 +10%',                    'east', 'medium', 2, '[{"type":"stat","stat":"cri","value":10}]', 10, 9),
('신속 증강 II','스피드 +60',                          'east', 'medium', 2, '[{"type":"stat","stat":"spd","value":60}]', 11, 9);

-- ============================================================
-- 유틸존 (서) — 38개
-- 소형 30개 + 중형 8개
-- ============================================================

-- 소형: HP+50 ×8
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('생명력 I',  'HP +50', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":5}]', -10, 0),
('생명력 II', 'HP +50', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":5}]', -11, 0),
('생명력 III','HP +50', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":5}]', -12, 0),
('생명력 IV', 'HP +50', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":5}]', -13, 0),
('생명력 V',  'HP +50', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":5}]', -10, 1),
('생명력 VI', 'HP +50', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":5}]', -11, 1),
('생명력 VII','HP +50', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":5}]', -12, 1),
('생명력 VIII','HP +50', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":5}]', -13, 1);

-- 소형: 방어력+6 ×8
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('철벽 I',  '방어력 +6', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":3}]', -10, 2),
('철벽 II', '방어력 +6', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":3}]', -11, 2),
('철벽 III','방어력 +6', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":3}]', -12, 2),
('철벽 IV', '방어력 +6', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":3}]', -13, 2),
('철벽 V',  '방어력 +6', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":3}]', -10, 3),
('철벽 VI', '방어력 +6', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":3}]', -11, 3),
('철벽 VII','방어력 +6', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":3}]', -12, 3),
('철벽 VIII','방어력 +6', 'west', 'small', 1, '[{"type":"stat","stat":"vit","value":3}]', -13, 3);

-- 소형: 도트저항+5% ×6
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('정화 I',  '도트 저항 +5%', 'west', 'small', 1, '[{"type":"passive","key":"dot_resist","value":5}]', -10, 4),
('정화 II', '도트 저항 +5%', 'west', 'small', 1, '[{"type":"passive","key":"dot_resist","value":5}]', -11, 4),
('정화 III','도트 저항 +5%', 'west', 'small', 1, '[{"type":"passive","key":"dot_resist","value":5}]', -12, 4),
('정화 IV', '도트 저항 +5%', 'west', 'small', 1, '[{"type":"passive","key":"dot_resist","value":5}]', -13, 4),
('정화 V',  '도트 저항 +5%', 'west', 'small', 1, '[{"type":"passive","key":"dot_resist","value":5}]', -10, 5),
('정화 VI', '도트 저항 +5%', 'west', 'small', 1, '[{"type":"passive","key":"dot_resist","value":5}]', -11, 5);

-- 소형: 스피드+15 ×4
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('기동 I',  '스피드 +15', 'west', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', -12, 5),
('기동 II', '스피드 +15', 'west', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', -13, 5),
('기동 III','스피드 +15', 'west', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', -10, 6),
('기동 IV', '스피드 +15', 'west', 'small', 1, '[{"type":"stat","stat":"spd","value":15}]', -11, 6);

-- 소형: 회피+3% ×4
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('회피 I',  '회피 +3%', 'west', 'small', 1, '[{"type":"stat","stat":"dex","value":3}]', -12, 6),
('회피 II', '회피 +3%', 'west', 'small', 1, '[{"type":"stat","stat":"dex","value":3}]', -13, 6),
('회피 III','회피 +3%', 'west', 'small', 1, '[{"type":"stat","stat":"dex","value":3}]', -10, 7),
('회피 IV', '회피 +3%', 'west', 'small', 1, '[{"type":"stat","stat":"dex","value":3}]', -11, 7);

-- 중형 8개
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('수호 본능 II',  'HP 40% 이하 시 방어력 +25%',  'west', 'medium', 2, '[{"type":"passive","key":"guard_instinct","value":25}]', -12, 7),
('저주의 손',     '도트 데미지 +30%',             'west', 'medium', 2, '[{"type":"passive","key":"dot_amp","value":30}]', -13, 7),
('도트 저항 증강','도트 저항 +20%',               'west', 'medium', 2, '[{"type":"passive","key":"dot_resist","value":20}]', -10, 8),
('HP 증강 II',    'HP +200',                      'west', 'medium', 2, '[{"type":"stat","stat":"vit","value":20}]', -11, 8),
('HP 증강 III',   'HP +200',                      'west', 'medium', 2, '[{"type":"stat","stat":"vit","value":20}]', -12, 8),
('방어 증강 II',  '방어력 +25',                   'west', 'medium', 2, '[{"type":"stat","stat":"vit","value":12}]', -13, 8),
('방어 증강 III', '방어력 +25',                   'west', 'medium', 2, '[{"type":"stat","stat":"vit","value":12}]', -10, 9),
('회피 증강',     '회피 +8%',                     'west', 'medium', 2, '[{"type":"stat","stat":"dex","value":8}]', -11, 9);

-- ============================================================
-- 공용 중앙존 — 20개
-- 소형 12개 + 중형 4개 + 대형 4개
-- ============================================================

-- 소형 12개 (각 스탯 2개씩)
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('근원 힘 I',     '힘 +4', 'center', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 0, -5),
('근원 힘 II',    '힘 +4', 'center', 'small', 1, '[{"type":"stat","stat":"str","value":4}]', 1, -5),
('근원 민첩 I',   '민첩 +4', 'center', 'small', 1, '[{"type":"stat","stat":"dex","value":4}]', 2, -5),
('근원 민첩 II',  '민첩 +4', 'center', 'small', 1, '[{"type":"stat","stat":"dex","value":4}]', 3, -5),
('근원 지능 I',   '지능 +4', 'center', 'small', 1, '[{"type":"stat","stat":"int","value":4}]', 0, -6),
('근원 지능 II',  '지능 +4', 'center', 'small', 1, '[{"type":"stat","stat":"int","value":4}]', 1, -6),
('근원 체력 I',   '체력 +4', 'center', 'small', 1, '[{"type":"stat","stat":"vit","value":4}]', 2, -6),
('근원 체력 II',  '체력 +4', 'center', 'small', 1, '[{"type":"stat","stat":"vit","value":4}]', 3, -6),
('근원 스피드 I',   '스피드 +20', 'center', 'small', 1, '[{"type":"stat","stat":"spd","value":20}]', 0, -7),
('근원 스피드 II',  '스피드 +20', 'center', 'small', 1, '[{"type":"stat","stat":"spd","value":20}]', 1, -7),
('근원 치명 I',   '치명타 확률 +4%', 'center', 'small', 1, '[{"type":"stat","stat":"cri","value":4}]', 2, -7),
('근원 치명 II',  '치명타 확률 +4%', 'center', 'small', 1, '[{"type":"stat","stat":"cri","value":4}]', 3, -7);

-- 중형 4개
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('만능 전사',     '힘 +8, 체력 +8', 'center', 'medium', 2, '[{"type":"stat","stat":"str","value":8},{"type":"stat","stat":"vit","value":8}]', 0, -8),
('만능 마법사',   '지능 +8, 스피드 +30', 'center', 'medium', 2, '[{"type":"stat","stat":"int","value":8},{"type":"stat","stat":"spd","value":30}]', 1, -8),
('만능 도적',     '민첩 +8, 치명타 확률 +8%', 'center', 'medium', 2, '[{"type":"stat","stat":"dex","value":8},{"type":"stat","stat":"cri","value":8}]', 2, -8),
('만능 성직자',   '지능 +6, 체력 +6', 'center', 'medium', 2, '[{"type":"stat","stat":"int","value":6},{"type":"stat","stat":"vit","value":6}]', 3, -8);

-- 대형 4개 (공용 키스톤)
INSERT INTO node_definitions (name, description, zone, tier, cost, effects, position_x, position_y) VALUES
('광전사의 심장', '공격력+40%, 스피드+20%, 방어력-30%', 'center', 'large', 4,
 '[{"type":"passive","key":"berserker_heart","value":1},{"type":"stat","stat":"str","value":20},{"type":"stat","stat":"spd","value":60}]', 0, -10),
('철벽의 의지',   '방어력+50%, HP+20%, 스피드-20%', 'center', 'large', 4,
 '[{"type":"passive","key":"iron_will","value":1},{"type":"stat","stat":"vit","value":25}]', 1, -10),
('마력의 흐름',   '모든 스킬 쿨타임-1행동, HP-15%', 'center', 'large', 4,
 '[{"type":"passive","key":"mana_flow","value":1}]', 2, -10),
('집중의 경지',   '치명타 확률 +25%, 치명타 데미지 +50%, 공격력 -10%', 'center', 'large', 4,
 '[{"type":"passive","key":"focus_mastery","value":1},{"type":"stat","stat":"cri","value":25}]', 3, -10);

-- ============================================================
-- 전사 고유존 (north_warrior) — 42개
-- 소형 27개 + 중형 12개 + 대형 3개
-- ============================================================

-- 소형 27개: STR+5 ×9, VIT+5 ×9, SPD+15 ×9
INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '전사 힘 ' || n, '힘 +5', 'north_warrior', 'small', 1, 'warrior',
       '[{"type":"stat","stat":"str","value":5}]', n-1, -15
FROM generate_series(1, 9) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '전사 체력 ' || n, '체력 +5', 'north_warrior', 'small', 1, 'warrior',
       '[{"type":"stat","stat":"vit","value":5}]', n-1, -16
FROM generate_series(1, 9) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '전사 스피드 ' || n, '스피드 +15', 'north_warrior', 'small', 1, 'warrior',
       '[{"type":"stat","stat":"spd","value":15}]', n-1, -17
FROM generate_series(1, 9) n;

-- 중형 12개
INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('전사 출혈 강화',     '출혈 도트 데미지 +40%',        'north_warrior', 'medium', 2, 'warrior', '[{"type":"passive","key":"bleed_amp","value":40}]', 0, -18),
('전사 흡혈 강화',     '흡혈량 +15%',                  'north_warrior', 'medium', 2, 'warrior', '[{"type":"passive","key":"lifesteal_amp","value":15}]', 1, -18),
('전사 반격 강화',     '반사 데미지 +20%',             'north_warrior', 'medium', 2, 'warrior', '[{"type":"passive","key":"reflect_amp","value":20}]', 2, -18),
('전사 철벽 강화',     '실드 효과 +30%',               'north_warrior', 'medium', 2, 'warrior', '[{"type":"passive","key":"shield_amp","value":30}]', 3, -18),
('무쌍난무',           '타격 1회 증가',                'north_warrior', 'medium', 2, 'warrior', '[{"type":"passive","key":"extra_hit","value":1}]', 4, -18),
('전사 분노 강화',     '자해 데미지 20% 감소',         'north_warrior', 'medium', 2, 'warrior', '[{"type":"passive","key":"rage_reduce","value":20}]', 5, -18),
('전사 STR 증강 I',    '힘 +12',                      'north_warrior', 'medium', 2, 'warrior', '[{"type":"stat","stat":"str","value":12}]', 6, -18),
('전사 STR 증강 II',   '힘 +12',                      'north_warrior', 'medium', 2, 'warrior', '[{"type":"stat","stat":"str","value":12}]', 7, -18),
('전사 VIT 증강 I',    '체력 +12',                      'north_warrior', 'medium', 2, 'warrior', '[{"type":"stat","stat":"vit","value":12}]', 8, -18),
('전사 VIT 증강 II',   '체력 +12',                      'north_warrior', 'medium', 2, 'warrior', '[{"type":"stat","stat":"vit","value":12}]', 0, -19),
('전사 치명타 증강',      '치명타 확률 +8%',                      'north_warrior', 'medium', 2, 'warrior', '[{"type":"stat","stat":"cri","value":8}]', 1, -19),
('전사 SPD 증강',      '스피드 +50',                      'north_warrior', 'medium', 2, 'warrior', '[{"type":"stat","stat":"spd","value":50}]', 2, -19);

-- 대형 3개
INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('불굴의 투혼',   'HP30%이하 공격력+60%, HP회복량-30%', 'north_warrior', 'large', 4, 'warrior',
 '[{"type":"passive","key":"undying_fury","value":60}]', 3, -20),
('전쟁의 신',     '물리데미지+35%, 흡혈+10%, 스킬쿨+1', 'north_warrior', 'large', 4, 'warrior',
 '[{"type":"passive","key":"war_god","value":35}]', 5, -20),
('반격의 화신',   '피격데미지 30%반사, 공격력-20%', 'north_warrior', 'large', 4, 'warrior',
 '[{"type":"passive","key":"counter_incarnation","value":30}]', 7, -20);

-- ============================================================
-- 마법사 고유존 (north_mage) — 42개
-- ============================================================

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '마법사 지능 ' || n, '지능 +5', 'north_mage', 'small', 1, 'mage',
       '[{"type":"stat","stat":"int","value":5}]', n+9, -15
FROM generate_series(1, 9) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '마법사 스피드 ' || n, '스피드 +15', 'north_mage', 'small', 1, 'mage',
       '[{"type":"stat","stat":"spd","value":15}]', n+9, -16
FROM generate_series(1, 9) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '마법사 치명 ' || n, '치명타 확률 +3%', 'north_mage', 'small', 1, 'mage',
       '[{"type":"stat","stat":"cri","value":3}]', n+9, -17
FROM generate_series(1, 9) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('마법사 도트 강화',     '도트 데미지 +40%',            'north_mage', 'medium', 2, 'mage', '[{"type":"passive","key":"dot_amp","value":40}]', 10, -18),
('마법사 제어 강화',     '게이지 조작 효과 +30%',       'north_mage', 'medium', 2, 'mage', '[{"type":"passive","key":"gauge_control_amp","value":30}]', 11, -18),
('마법사 스턴 강화',     '스턴 지속 +1행동',            'north_mage', 'medium', 2, 'mage', '[{"type":"passive","key":"stun_extend","value":1}]', 12, -18),
('마법사 동결 강화',     '동결 지속 +1행동',            'north_mage', 'medium', 2, 'mage', '[{"type":"passive","key":"freeze_extend","value":1}]', 13, -18),
('마법사 화염 강화',     '화상 데미지 +50%',            'north_mage', 'medium', 2, 'mage', '[{"type":"passive","key":"burn_amp","value":50}]', 14, -18),
('마법사 냉기 강화',     '냉기 스피드 감소 +15%',       'north_mage', 'medium', 2, 'mage', '[{"type":"passive","key":"frost_amp","value":15}]', 15, -18),
('마법사 INT 증강 I',    '지능 +12',                     'north_mage', 'medium', 2, 'mage', '[{"type":"stat","stat":"int","value":12}]', 16, -18),
('마법사 INT 증강 II',   '지능 +12',                     'north_mage', 'medium', 2, 'mage', '[{"type":"stat","stat":"int","value":12}]', 17, -18),
('마법사 SPD 증강 I',    '스피드 +50',                     'north_mage', 'medium', 2, 'mage', '[{"type":"stat","stat":"spd","value":50}]', 10, -19),
('마법사 SPD 증강 II',   '스피드 +50',                     'north_mage', 'medium', 2, 'mage', '[{"type":"stat","stat":"spd","value":50}]', 11, -19),
('마법사 치명타 증강',      '치명타 확률 +8%',                     'north_mage', 'medium', 2, 'mage', '[{"type":"stat","stat":"cri","value":8}]', 12, -19),
('마법사 VIT 증강',      '체력 +10',                     'north_mage', 'medium', 2, 'mage', '[{"type":"stat","stat":"vit","value":10}]', 13, -19);

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('원소 폭주',     '도트데미지+80%, 도트지속+1, 직접스킬-20%', 'north_mage', 'large', 4, 'mage',
 '[{"type":"passive","key":"elemental_storm","value":80}]', 14, -20),
('시간 지배자',   '게이지조작+100%, 공격쿨+2', 'north_mage', 'large', 4, 'mage',
 '[{"type":"passive","key":"time_lord","value":100}]', 15, -20),
('마력 과적',     '스킬데미지+50%, 3행동마다 HP5%소모', 'north_mage', 'large', 4, 'mage',
 '[{"type":"passive","key":"mana_overload","value":50}]', 16, -20);

-- ============================================================
-- 성직자 고유존 (north_cleric) — 42개
-- ============================================================

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '성직자 지능 ' || n, '지능 +5', 'north_cleric', 'small', 1, 'cleric',
       '[{"type":"stat","stat":"int","value":5}]', n+19, -15
FROM generate_series(1, 9) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '성직자 체력 ' || n, '체력 +5', 'north_cleric', 'small', 1, 'cleric',
       '[{"type":"stat","stat":"vit","value":5}]', n+19, -16
FROM generate_series(1, 9) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '성직자 스피드 ' || n, '스피드 +15', 'north_cleric', 'small', 1, 'cleric',
       '[{"type":"stat","stat":"spd","value":15}]', n+19, -17
FROM generate_series(1, 9) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('성직자 치유 강화',     '회복량 +30%',                 'north_cleric', 'medium', 2, 'cleric', '[{"type":"passive","key":"heal_amp","value":30}]', 20, -18),
('성직자 실드 강화',     '실드 효과 +40%',              'north_cleric', 'medium', 2, 'cleric', '[{"type":"passive","key":"shield_amp","value":40}]', 21, -18),
('성직자 반사 강화',     '반사 데미지 +25%',            'north_cleric', 'medium', 2, 'cleric', '[{"type":"passive","key":"reflect_amp","value":25}]', 22, -18),
('성직자 심판 강화',     '공격 스킬 데미지 +25%',       'north_cleric', 'medium', 2, 'cleric', '[{"type":"passive","key":"judge_amp","value":25}]', 23, -18),
('성직자 신성 도트',     '신성 도트 +40%',              'north_cleric', 'medium', 2, 'cleric', '[{"type":"passive","key":"holy_dot_amp","value":40}]', 24, -18),
('성직자 부활 강화',     '부활 HP +20%',                'north_cleric', 'medium', 2, 'cleric', '[{"type":"passive","key":"resurrect_amp","value":20}]', 25, -18),
('성직자 INT 증강 I',    '지능 +12',                     'north_cleric', 'medium', 2, 'cleric', '[{"type":"stat","stat":"int","value":12}]', 26, -18),
('성직자 INT 증강 II',   '지능 +12',                     'north_cleric', 'medium', 2, 'cleric', '[{"type":"stat","stat":"int","value":12}]', 27, -18),
('성직자 VIT 증강 I',    '체력 +12',                     'north_cleric', 'medium', 2, 'cleric', '[{"type":"stat","stat":"vit","value":12}]', 20, -19),
('성직자 VIT 증강 II',   '체력 +12',                     'north_cleric', 'medium', 2, 'cleric', '[{"type":"stat","stat":"vit","value":12}]', 21, -19),
('성직자 SPD 증강',      '스피드 +50',                     'north_cleric', 'medium', 2, 'cleric', '[{"type":"stat","stat":"spd","value":50}]', 22, -19),
('성직자 치명타 증강',      '치명타 확률 +8%',                     'north_cleric', 'medium', 2, 'cleric', '[{"type":"stat","stat":"cri","value":8}]', 23, -19);

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('신성한 심판자', '공격스킬+45%, 보조-30%', 'north_cleric', 'large', 4, 'cleric',
 '[{"type":"passive","key":"holy_judge","value":45}]', 24, -20),
('성역의 수호자', '실드/회복+50%, 공격력-25%', 'north_cleric', 'large', 4, 'cleric',
 '[{"type":"passive","key":"sanctuary_guard","value":50}]', 25, -20),
('균형의 사도',   '공격/보조 모두+20%, 다른키스톤중복불가', 'north_cleric', 'large', 4, 'cleric',
 '[{"type":"passive","key":"balance_apostle","value":20}]', 26, -20);

-- ============================================================
-- 도적 고유존 (north_rogue) — 42개
-- ============================================================

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '도적 민첩 ' || n, '민첩 +5', 'north_rogue', 'small', 1, 'rogue',
       '[{"type":"stat","stat":"dex","value":5}]', n+29, -15
FROM generate_series(1, 9) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '도적 스피드 ' || n, '스피드 +15', 'north_rogue', 'small', 1, 'rogue',
       '[{"type":"stat","stat":"spd","value":15}]', n+29, -16
FROM generate_series(1, 9) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y)
SELECT '도적 치명 ' || n, '치명타 확률 +3%', 'north_rogue', 'small', 1, 'rogue',
       '[{"type":"stat","stat":"cri","value":3}]', n+29, -17
FROM generate_series(1, 9) n;

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('도적 독 강화',         '독 도트 +40%',                'north_rogue', 'medium', 2, 'rogue', '[{"type":"passive","key":"poison_amp","value":40}]', 30, -18),
('도적 연속행동 강화',   '연속행동 시 데미지 +15%',     'north_rogue', 'medium', 2, 'rogue', '[{"type":"passive","key":"chain_action_amp","value":15}]', 31, -18),
('도적 제어 강화',       '제어 스킬 효과 +25%',         'north_rogue', 'medium', 2, 'rogue', '[{"type":"passive","key":"control_amp","value":25}]', 32, -18),
('도적 회피 강화',       '회피 +10%',                   'north_rogue', 'medium', 2, 'rogue', '[{"type":"stat","stat":"dex","value":10}]', 33, -18),
('도적 독폭발 강화',     '독 폭발 배율 +50%',           'north_rogue', 'medium', 2, 'rogue', '[{"type":"passive","key":"poison_burst_amp","value":50}]', 34, -18),
('도적 연막 강화',       '연막 지속 +1행동',            'north_rogue', 'medium', 2, 'rogue', '[{"type":"passive","key":"smoke_extend","value":1}]', 35, -18),
('도적 DEX 증강 I',      '민첩 +12',                     'north_rogue', 'medium', 2, 'rogue', '[{"type":"stat","stat":"dex","value":12}]', 36, -18),
('도적 DEX 증강 II',     '민첩 +12',                     'north_rogue', 'medium', 2, 'rogue', '[{"type":"stat","stat":"dex","value":12}]', 37, -18),
('도적 SPD 증강 I',      '스피드 +50',                     'north_rogue', 'medium', 2, 'rogue', '[{"type":"stat","stat":"spd","value":50}]', 30, -19),
('도적 SPD 증강 II',     '스피드 +50',                     'north_rogue', 'medium', 2, 'rogue', '[{"type":"stat","stat":"spd","value":50}]', 31, -19),
('도적 치명타 증강 I',      '치명타 확률 +8%',                     'north_rogue', 'medium', 2, 'rogue', '[{"type":"stat","stat":"cri","value":8}]', 32, -19),
('도적 치명타 증강 II',     '치명타 확률 +8%',                     'north_rogue', 'medium', 2, 'rogue', '[{"type":"stat","stat":"cri","value":8}]', 33, -19);

INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y) VALUES
('독의 군주',     '독중첩+3, 독데미지+60%, 물리-15%', 'north_rogue', 'large', 4, 'rogue',
 '[{"type":"passive","key":"poison_lord","value":60}]', 34, -20),
('그림자 춤',     '백스텝쿨-2, 연속행동데미지+15%, HP-20%', 'north_rogue', 'large', 4, 'rogue',
 '[{"type":"passive","key":"shadow_dance","value":15}]', 35, -20),
('트릭스터',      '제어+50%, 적스피드감소+30%, 직접데미지-20%', 'north_rogue', 'large', 4, 'rogue',
 '[{"type":"passive","key":"trickster","value":50}]', 36, -20);

COMMIT;
