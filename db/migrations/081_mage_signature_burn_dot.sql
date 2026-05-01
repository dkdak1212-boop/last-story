-- 마법사 시그니처 스킬 (창세의 빛, 원소 대폭발) 설명 갱신 — 화상 도트 5행동 추가 명시.
-- 코드 측에서 자동 도트 부여, 도트 계수는 마법사 도트 1.5x 추가 (2.25) 적용.
SET client_encoding TO 'UTF8';
BEGIN;

UPDATE skills
   SET description = '7.76배 × 4연타 마법 피해 + INT 1당 +3000 고정 피해 (각 타) + 화상 도트 5행동 · 쿨 6행동'
 WHERE class_name = 'mage' AND name = '원소 대폭발';

UPDATE skills
   SET description = '23.92배 마법 피해 + INT 1당 +5000 고정 피해 · 확정 2회 발동 + 화상 도트 5행동 · 쿨 9행동'
 WHERE class_name = 'mage' AND name = '창세의 빛';

COMMIT;
