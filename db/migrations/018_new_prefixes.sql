-- 새 접두사 8종 (4티어씩 = 32개)

-- 약화: 몬스터 방어력% 감소
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('약화시키는', 1, 'def_reduce_pct', 1, 3),
('무력화하는', 2, 'def_reduce_pct', 3, 5),
('분쇄하는',   3, 'def_reduce_pct', 6, 8),
('파괴하는',   4, 'def_reduce_pct', 8, 10);

-- 저주: 몬스터 속도% 감소
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('저주받은', 1, 'slow_pct', 1, 3),
('속박하는', 2, 'slow_pct', 3, 5),
('얼어붙은', 3, 'slow_pct', 6, 8),
('시간정지', 4, 'slow_pct', 8, 10);

-- 확산: 도트 데미지(독/출혈) 증가%
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('감염된',   1, 'dot_amp_pct', 1, 3),
('부식하는', 2, 'dot_amp_pct', 3, 5),
('역병의',   3, 'dot_amp_pct', 6, 8),
('전염시키는', 4, 'dot_amp_pct', 8, 10);

-- 재생: 틱당 체력회복
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('회복하는', 1, 'hp_regen', 10, 30),
('재생하는', 2, 'hp_regen', 30, 70),
('생명의',   3, 'hp_regen', 70, 130),
('불사의',   4, 'hp_regen', 130, 200);

-- 흡혈귀: 데미지 흡혈%
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('흡혈하는', 1, 'lifesteal_pct', 5, 8),
('갈증나는', 2, 'lifesteal_pct', 8, 12),
('피에 젖은', 3, 'lifesteal_pct', 12, 16),
('흡혈왕의', 4, 'lifesteal_pct', 16, 20);

-- 황금: 골드 획득량 증가%
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('부유한',   1, 'gold_bonus_pct', 5, 8),
('황금빛',   2, 'gold_bonus_pct', 8, 12),
('축복받은', 3, 'gold_bonus_pct', 12, 16),
('마이다스', 4, 'gold_bonus_pct', 16, 20);

-- 경험: 경험치 획득량 증가%
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('학습하는', 1, 'exp_bonus_pct', 1, 3),
('깨우치는', 2, 'exp_bonus_pct', 3, 5),
('각성하는', 3, 'exp_bonus_pct', 5, 8),
('초월한',   4, 'exp_bonus_pct', 8, 10);

-- 날카로움: 크리티컬 데미지 증가%
INSERT INTO item_prefixes (name, tier, stat_key, min_val, max_val) VALUES
('날카로운', 1, 'crit_dmg_pct', 1, 3),
('베어가르는', 2, 'crit_dmg_pct', 3, 5),
('관통하는', 3, 'crit_dmg_pct', 6, 8),
('절단하는', 4, 'crit_dmg_pct', 8, 10);
