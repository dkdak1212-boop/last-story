-- 광역 스킬을 단일 대상으로 변환 + 배율 상향 조정
BEGIN;

-- 전사
UPDATE skills SET target = 'enemy', damage_mult = 1.60 WHERE class_name = 'warrior' AND name = '회전 베기';
UPDATE skills SET target = 'enemy', damage_mult = 2.30 WHERE class_name = 'warrior' AND name = '대지 가르기';

-- 검사
UPDATE skills SET target = 'enemy', damage_mult = 2.10 WHERE class_name = 'swordsman' AND name = '검압';
UPDATE skills SET target = 'enemy', damage_mult = 3.20 WHERE class_name = 'swordsman' AND name = '난무';

-- 궁수
UPDATE skills SET target = 'enemy', damage_mult = 2.80 WHERE class_name = 'archer' AND name = '난사';
UPDATE skills SET target = 'enemy', damage_mult = 2.00 WHERE class_name = 'archer' AND name = '작렬탄';
UPDATE skills SET target = 'enemy', damage_mult = 3.00 WHERE class_name = 'archer' AND name = '폭우';

-- 도적
UPDATE skills SET target = 'enemy', damage_mult = 2.60 WHERE class_name = 'rogue' AND name = '독무';

-- 암살자
UPDATE skills SET target = 'enemy', damage_mult = 2.70 WHERE class_name = 'assassin' AND name = '독쇄';

-- 마법사
UPDATE skills SET target = 'enemy', damage_mult = 1.40 WHERE class_name = 'mage' AND name = '빙결';
UPDATE skills SET target = 'enemy', damage_mult = 2.20 WHERE class_name = 'mage' AND name = '유성';
UPDATE skills SET target = 'enemy', damage_mult = 2.30 WHERE class_name = 'mage' AND name = '마력 방출';
UPDATE skills SET target = 'enemy', damage_mult = 3.00 WHERE class_name = 'mage' AND name = '연쇄 뇌전';
UPDATE skills SET target = 'enemy', damage_mult = 4.20 WHERE class_name = 'mage' AND name = '종언';

-- 사제
UPDATE skills SET target = 'enemy', damage_mult = 2.80 WHERE class_name = 'priest' AND name = '심판';

-- 드루이드
UPDATE skills SET target = 'enemy', damage_mult = 2.10 WHERE class_name = 'druid' AND name = '뇌우';
UPDATE skills SET target = 'enemy', damage_mult = 4.40 WHERE class_name = 'druid' AND name = '자연의 분노';

COMMIT;
