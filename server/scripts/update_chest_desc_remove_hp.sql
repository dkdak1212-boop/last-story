-- 상자 설명에서 HP 버프 언급 제거
UPDATE items SET description = '개봉 시 대량의 골드·EXP·메달과 부스터 3종(EXP/Gold/Drop +50%, 1시간), 잭팟 아이템을 획득합니다.'
WHERE id = 843;
UPDATE items SET description = '개봉 시 중량의 골드·EXP·메달과 부스터 3종(EXP/Gold/Drop +50%, 1시간), 잭팟 아이템을 획득합니다.'
WHERE id = 844;
-- 구리는 원래 택1 EXP만이라 변경 없음
SELECT id, name, description FROM items WHERE id IN (843, 844, 845) ORDER BY id;
