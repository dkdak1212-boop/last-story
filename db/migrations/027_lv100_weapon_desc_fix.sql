-- Lv.100 유니크 무기 description 툴팁 정정 (unique_prefix_stats 데이터와 PrefixDisplay 라벨에 맞춤)
-- 변경 범위: id 800~814 중 11건 (807/808/812/813/814는 이미 일치, 생략)
SET client_encoding TO 'UTF8';
BEGIN;

UPDATE items SET description = '[유니크] 공격력 +18%, 치명타 데미지 +25%' WHERE id = 800;
UPDATE items SET description = '[유니크] 공격력 +12%, 치명타 데미지 +15%' WHERE id = 801;
UPDATE items SET description = '[유니크] 공격력 +10%, 치명타 데미지 +22%, 몬스터 방어력 -15%' WHERE id = 802;
UPDATE items SET description = '[유니크] 마법공격 +11%, 치명타 데미지 +15%, 치명타 시 게이지 +7%' WHERE id = 803;
UPDATE items SET description = '[유니크] 마법공격 +15%, 치명타 데미지 +13%' WHERE id = 804;
UPDATE items SET description = '[유니크] 마법공격 +10%, 치명타 데미지 +17%, 적 방어 10% 추가 무시' WHERE id = 805;
UPDATE items SET description = '[유니크] 실드 효과 +20%, 받는 데미지 -10%' WHERE id = 806;
UPDATE items SET description = '[유니크] 공격력 +15%, 치명타 데미지 +35%' WHERE id = 809;
UPDATE items SET description = '[유니크] 공격력 +12%, 기습(5초 미피격 시 다음 공격) +30%' WHERE id = 810;
UPDATE items SET description = '[유니크] 공격력 +13%, 도트 데미지 +40%' WHERE id = 811;

SELECT id, name, description FROM items WHERE id BETWEEN 800 AND 814 ORDER BY id;

COMMIT;
