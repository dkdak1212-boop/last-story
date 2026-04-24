-- 개인 EXP 배율 버프 시스템
-- 관리자가 특정 캐릭터에게 부여하는 맞춤형 경험치 버프
-- 종료 조건: 캐릭터 레벨이 personal_exp_mult_max_level 에 도달
-- 기존 exp_boost_until(+50%)·이벤트 버프와 독립 곱산 적용
SET client_encoding TO 'UTF8';
BEGIN;

ALTER TABLE characters ADD COLUMN IF NOT EXISTS personal_exp_mult NUMERIC NOT NULL DEFAULT 1.0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS personal_exp_mult_max_level INTEGER;

COMMIT;
