SET client_encoding TO 'UTF8';
BEGIN;

-- 1. 강타 (id 81): HP 소모 표현 → 고정 추가 데미지로 정정
UPDATE skills SET description = 'ATK x324% + 자신 최대 HP 10% 고정 추가 데미지' WHERE id = 81;

-- 2. 심판의 철퇴 (id 96): HP% 보너스 표기 추가
UPDATE skills SET description = 'MATK x330% + 50, 쉴드 비례 추가 데미지 + 최대 HP 10% 추가' WHERE id = 96;

-- 4. 차원 붕괴 (id 117): 실드 % 명확화
UPDATE skills SET description = 'MATK x743%, 최대 HP 10% 실드 2행동 · CC(동결/기절) 적에게 +50%' WHERE id = 117;

-- 5. 신성 타격 (id 109): 방어력 비례 명확화
UPDATE skills SET description = 'MATK x270% + 방어력 x 200% 추가 데미지' WHERE id = 109;

SELECT id, name, description FROM skills WHERE id IN (81, 96, 109, 117);

COMMIT;
