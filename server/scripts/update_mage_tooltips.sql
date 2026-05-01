-- 마법사 스킬 툴팁 최신화 (계수 ×1.15 반영, DOT ×1.5 표기, INT 고정 피해 표기)
SET client_encoding TO 'UTF8';
BEGIN;

UPDATE skills SET description = '2.66배 마법 피해 + 도트 2행동 (DOT ×1.5) · 기본기' WHERE class_name='mage' AND name='화염구';
UPDATE skills SET description = '3.04배 마법 피해 + 적 스피드 -30% (2행동) · 쿨 3행동' WHERE class_name='mage' AND name='냉기 창';
UPDATE skills SET description = '적 게이지 리셋 + 50% 확률 기절 (1행동) · 쿨 5행동' WHERE class_name='mage' AND name='게이지 폭발';
UPDATE skills SET description = '4.60배 마법 피해 + 기절 (1행동) · 쿨 4행동' WHERE class_name='mage' AND name='번개 사슬';
UPDATE skills SET description = '4.03배 마법 피해 + 적 게이지 동결 (2행동) · 쿨 6행동' WHERE class_name='mage' AND name='빙결 감옥';
UPDATE skills SET description = '5.31배 마법 피해 + 도트 3행동 (DOT ×1.5) · 쿨 6행동' WHERE class_name='mage' AND name='유성 낙하';
UPDATE skills SET description = '마법 데미지 +80% (3행동) · 쿨 5행동 · 자유행동' WHERE class_name='mage' AND name='마력 과부하';
UPDATE skills SET description = '3.80배 × 2연타 마법 피해 · 쿨 5행동' WHERE class_name='mage' AND name='연쇄 번개';
UPDATE skills SET description = '6.33배 마법 피해 + 적 게이지 동결 (3행동) · 쿨 7행동' WHERE class_name='mage' AND name='절대 영도';
UPDATE skills SET description = '6.65배 마법 피해 + INT 1당 +1000 고정 피해 + 도트 4행동 (DOT ×1.5) · 쿨 7행동' WHERE class_name='mage' AND name='운석 폭격';
UPDATE skills SET description = '8.54배 마법 피해 + 자기 최대 HP 10% 실드 (2행동) · 쿨 9행동' WHERE class_name='mage' AND name='차원 붕괴';
UPDATE skills SET description = '자기 스피드 +50% (3행동) · 쿨 8행동 · 자유행동' WHERE class_name='mage' AND name='마력 집중';
UPDATE skills SET description = '7.48배 마법 피해 + 적 게이지 동결 (3행동) · 쿨 7행동' WHERE class_name='mage' AND name='시간 왜곡';
UPDATE skills SET description = '7.59배 마법 피해 + 도트 5행동 (DOT ×1.5) · 쿨 6행동' WHERE class_name='mage' AND name='태양의 불꽃';
UPDATE skills SET description = '10.44배 마법 피해 + INT 1당 +2000 고정 피해 · 쿨 9행동' WHERE class_name='mage' AND name='별의 종말';
UPDATE skills SET description = '10.35배 마법 피해 + 적 게이지 동결 (4행동) · 쿨 9행동' WHERE class_name='mage' AND name='절대 영역';
UPDATE skills SET description = '12.08배 마법 피해 + INT 1당 +1000 고정 피해 · 쿨 7행동' WHERE class_name='mage' AND name='마나 폭주';
UPDATE skills SET description = '12.08배 마법 피해 + 도트 6행동 (DOT ×1.5) · 쿨 8행동' WHERE class_name='mage' AND name='시공 붕괴';
UPDATE skills SET description = '5.75배 × 4연타 마법 피해 + INT 1당 +3000 고정 피해 (각 타) · 쿨 9행동' WHERE class_name='mage' AND name='원소 대폭발';
UPDATE skills SET description = '18.40배 마법 피해 + INT 1당 +5000 고정 피해 · 50% 확률 2회 발동 · 쿨 12행동' WHERE class_name='mage' AND name='창세의 빛';

SELECT name, required_level, description FROM skills WHERE class_name='mage' ORDER BY required_level;

COMMIT;
