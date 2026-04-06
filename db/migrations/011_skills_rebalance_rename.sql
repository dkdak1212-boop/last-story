-- v0.8.2: 스킬 이름 개선 + 밸런스 조정
BEGIN;

-- ===== 전사 (warrior) =====
UPDATE skills SET name = '강타'          WHERE class_name = 'warrior' AND required_level = 1;
UPDATE skills SET name = '광폭화'        WHERE class_name = 'warrior' AND required_level = 3;
UPDATE skills SET name = '회전 베기'     WHERE class_name = 'warrior' AND required_level = 5;
UPDATE skills SET name = '방패 돌진',     damage_mult = 2.20, mp_cost = 12, cooldown_sec = 8   WHERE class_name = 'warrior' AND required_level = 10;
UPDATE skills SET name = '전의 고취'     WHERE class_name = 'warrior' AND required_level = 20;
UPDATE skills SET name = '대지 가르기',   damage_mult = 1.90, mp_cost = 24, cooldown_sec = 16  WHERE class_name = 'warrior' AND required_level = 30;
UPDATE skills SET name = '철벽',          damage_mult = 1.20, mp_cost = 28, cooldown_sec = 28  WHERE class_name = 'warrior' AND required_level = 40;
UPDATE skills SET name = '천둥 강타',     damage_mult = 3.20, mp_cost = 34, cooldown_sec = 18  WHERE class_name = 'warrior' AND required_level = 50;
UPDATE skills SET name = '파멸의 일격',   damage_mult = 3.80, mp_cost = 44, cooldown_sec = 22  WHERE class_name = 'warrior' AND required_level = 60;
UPDATE skills SET name = '종말 강타',     damage_mult = 5.00, mp_cost = 58, cooldown_sec = 28  WHERE class_name = 'warrior' AND required_level = 70;

-- ===== 검사 (swordsman) =====
UPDATE skills SET name = '일격'          WHERE class_name = 'swordsman' AND required_level = 1;
UPDATE skills SET name = '연타'          WHERE class_name = 'swordsman' AND required_level = 3;
UPDATE skills SET name = '수비 태세'     WHERE class_name = 'swordsman' AND required_level = 5;
UPDATE skills SET name = '쌍검 난무',     damage_mult = 2.10, mp_cost = 10, cooldown_sec = 7   WHERE class_name = 'swordsman' AND required_level = 10;
UPDATE skills SET name = '질풍 연격',     damage_mult = 2.50, mp_cost = 16, cooldown_sec = 11  WHERE class_name = 'swordsman' AND required_level = 20;
UPDATE skills SET name = '검압',          damage_mult = 1.70, mp_cost = 22, cooldown_sec = 14  WHERE class_name = 'swordsman' AND required_level = 30;
UPDATE skills SET name = '역린'          WHERE class_name = 'swordsman' AND required_level = 40;
UPDATE skills SET name = '섬광',          damage_mult = 3.40, mp_cost = 30, cooldown_sec = 16  WHERE class_name = 'swordsman' AND required_level = 50;
UPDATE skills SET name = '난무',          damage_mult = 2.80, mp_cost = 38, cooldown_sec = 18  WHERE class_name = 'swordsman' AND required_level = 60;
UPDATE skills SET name = '일도양단',      damage_mult = 5.20, mp_cost = 54, cooldown_sec = 26  WHERE class_name = 'swordsman' AND required_level = 70;

-- ===== 궁수 (archer) =====
UPDATE skills SET name = '정조준'        WHERE class_name = 'archer' AND required_level = 1;
UPDATE skills SET name = '난사'          WHERE class_name = 'archer' AND required_level = 3;
UPDATE skills SET name = '집중'          WHERE class_name = 'archer' AND required_level = 5;
UPDATE skills SET name = '맹독전',        damage_mult = 1.90, mp_cost = 9, cooldown_sec = 7    WHERE class_name = 'archer' AND required_level = 10;
UPDATE skills SET name = '작렬탄',        damage_mult = 1.60, mp_cost = 14, cooldown_sec = 11  WHERE class_name = 'archer' AND required_level = 20;
UPDATE skills SET name = '응시'          WHERE class_name = 'archer' AND required_level = 30;
UPDATE skills SET name = '속사',          damage_mult = 2.80, mp_cost = 22, cooldown_sec = 12  WHERE class_name = 'archer' AND required_level = 40;
UPDATE skills SET name = '관통',          damage_mult = 3.60, mp_cost = 30, cooldown_sec = 16  WHERE class_name = 'archer' AND required_level = 50;
UPDATE skills SET name = '폭우',          damage_mult = 2.60, mp_cost = 38, cooldown_sec = 20  WHERE class_name = 'archer' AND required_level = 60;
UPDATE skills SET name = '천궁',          damage_mult = 5.00, mp_cost = 52, cooldown_sec = 24  WHERE class_name = 'archer' AND required_level = 70;

-- ===== 도적 (rogue) =====
UPDATE skills SET name = '독날',          damage_mult = 1.50, mp_cost = 6, cooldown_sec = 5    WHERE class_name = 'rogue' AND required_level = 1;
UPDATE skills SET name = '은신'          WHERE class_name = 'rogue' AND required_level = 3;
UPDATE skills SET name = '난도'          WHERE class_name = 'rogue' AND required_level = 5;
UPDATE skills SET name = '습격',          damage_mult = 2.20, mp_cost = 10, cooldown_sec = 7   WHERE class_name = 'rogue' AND required_level = 10;
UPDATE skills SET name = '연막'          WHERE class_name = 'rogue' AND required_level = 20;
UPDATE skills SET name = '급소',          damage_mult = 2.80, mp_cost = 18, cooldown_sec = 13  WHERE class_name = 'rogue' AND required_level = 30;
UPDATE skills SET name = '잔상'          WHERE class_name = 'rogue' AND required_level = 40;
UPDATE skills SET name = '독무',          damage_mult = 2.20, mp_cost = 26, cooldown_sec = 16  WHERE class_name = 'rogue' AND required_level = 50;
UPDATE skills SET name = '연쇄 암살',     damage_mult = 3.80, mp_cost = 36, cooldown_sec = 20  WHERE class_name = 'rogue' AND required_level = 60;
UPDATE skills SET name = '그림자 절단',   damage_mult = 4.80, mp_cost = 50, cooldown_sec = 26  WHERE class_name = 'rogue' AND required_level = 70;

-- ===== 암살자 (assassin) =====
UPDATE skills SET name = '급소 찌르기'   WHERE class_name = 'assassin' AND required_level = 1;
UPDATE skills SET name = '기습'          WHERE class_name = 'assassin' AND required_level = 3;
UPDATE skills SET name = '척살'          WHERE class_name = 'assassin' AND required_level = 5;
UPDATE skills SET name = '비수',          damage_mult = 1.90, mp_cost = 9, cooldown_sec = 7    WHERE class_name = 'assassin' AND required_level = 10;
UPDATE skills SET name = '잠영'          WHERE class_name = 'assassin' AND required_level = 20;
UPDATE skills SET name = '삼연쇄',        damage_mult = 2.70, mp_cost = 20, cooldown_sec = 13  WHERE class_name = 'assassin' AND required_level = 30;
UPDATE skills SET name = '독쇄',          damage_mult = 2.30, mp_cost = 22, cooldown_sec = 15  WHERE class_name = 'assassin' AND required_level = 40;
UPDATE skills SET name = '사영',          damage_mult = 3.80, mp_cost = 32, cooldown_sec = 18  WHERE class_name = 'assassin' AND required_level = 50;
UPDATE skills SET name = '참영',          damage_mult = 4.20, mp_cost = 40, cooldown_sec = 20  WHERE class_name = 'assassin' AND required_level = 60;
UPDATE skills SET name = '절멸',          damage_mult = 5.40, mp_cost = 56, cooldown_sec = 26  WHERE class_name = 'assassin' AND required_level = 70;

-- ===== 마법사 (mage) =====
UPDATE skills SET name = '화염구'        WHERE class_name = 'mage' AND required_level = 1;
UPDATE skills SET name = '빙결'          WHERE class_name = 'mage' AND required_level = 3;
UPDATE skills SET name = '유성'          WHERE class_name = 'mage' AND required_level = 7;
UPDATE skills SET name = '뇌격',          damage_mult = 2.10, mp_cost = 12, cooldown_sec = 7   WHERE class_name = 'mage' AND required_level = 10;
UPDATE skills SET name = '빙창',          damage_mult = 2.40, mp_cost = 17, cooldown_sec = 10  WHERE class_name = 'mage' AND required_level = 20;
UPDATE skills SET name = '마력 방출',     damage_mult = 1.90, mp_cost = 24, cooldown_sec = 14  WHERE class_name = 'mage' AND required_level = 30;
UPDATE skills SET name = '마력 증폭'     WHERE class_name = 'mage' AND required_level = 40;
UPDATE skills SET name = '연쇄 뇌전',     damage_mult = 2.60, mp_cost = 34, cooldown_sec = 16  WHERE class_name = 'mage' AND required_level = 50;
UPDATE skills SET name = '차원 균열',     damage_mult = 4.20, mp_cost = 44, cooldown_sec = 20  WHERE class_name = 'mage' AND required_level = 60;
UPDATE skills SET name = '종언',          damage_mult = 3.80, mp_cost = 55, cooldown_sec = 24  WHERE class_name = 'mage' AND required_level = 70;

-- ===== 사제 (priest) =====
UPDATE skills SET name = '치유'          WHERE class_name = 'priest' AND required_level = 1;
UPDATE skills SET name = '축복'          WHERE class_name = 'priest' AND required_level = 3;
UPDATE skills SET name = '성광'          WHERE class_name = 'priest' AND required_level = 5;
UPDATE skills SET name = '신벌',          damage_mult = 1.70, mp_cost = 10, cooldown_sec = 7   WHERE class_name = 'priest' AND required_level = 10;
UPDATE skills SET name = '생명의 빛',     damage_mult = 1.40, mp_cost = 18, cooldown_sec = 12  WHERE class_name = 'priest' AND required_level = 20;
UPDATE skills SET name = '정결',          damage_mult = 1.90, mp_cost = 20, cooldown_sec = 13  WHERE class_name = 'priest' AND required_level = 30;
UPDATE skills SET name = '성벽'          WHERE class_name = 'priest' AND required_level = 40;
UPDATE skills SET name = '심판',          damage_mult = 2.40, mp_cost = 34, cooldown_sec = 18  WHERE class_name = 'priest' AND required_level = 50;
UPDATE skills SET name = '재생의 기적',   damage_mult = 2.20, mp_cost = 42, cooldown_sec = 26  WHERE class_name = 'priest' AND required_level = 60;
UPDATE skills SET name = '신의 분노',     damage_mult = 4.40, mp_cost = 52, cooldown_sec = 24  WHERE class_name = 'priest' AND required_level = 70;

-- ===== 드루이드 (druid) =====
UPDATE skills SET name = '가시채찍'      WHERE class_name = 'druid' AND required_level = 1;
UPDATE skills SET name = '자연 치유',     damage_mult = 0.80 WHERE class_name = 'druid' AND required_level = 3;
UPDATE skills SET name = '야수화'        WHERE class_name = 'druid' AND required_level = 5;
UPDATE skills SET name = '맹독침',        damage_mult = 1.80, mp_cost = 9, cooldown_sec = 6    WHERE class_name = 'druid' AND required_level = 10;
UPDATE skills SET name = '재생력',        damage_mult = 1.10, mp_cost = 16, cooldown_sec = 13  WHERE class_name = 'druid' AND required_level = 20;
UPDATE skills SET name = '뇌우',          damage_mult = 1.70, mp_cost = 21, cooldown_sec = 14  WHERE class_name = 'druid' AND required_level = 30;
UPDATE skills SET name = '야성 해방'     WHERE class_name = 'druid' AND required_level = 40;
UPDATE skills SET name = '대지 진동',     damage_mult = 3.00, mp_cost = 30, cooldown_sec = 16  WHERE class_name = 'druid' AND required_level = 50;
UPDATE skills SET name = '세계수의 은혜', damage_mult = 2.00, mp_cost = 40, cooldown_sec = 24  WHERE class_name = 'druid' AND required_level = 60;
UPDATE skills SET name = '자연의 분노',   damage_mult = 4.00, mp_cost = 52, cooldown_sec = 24  WHERE class_name = 'druid' AND required_level = 70;

COMMIT;
