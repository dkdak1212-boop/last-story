SET client_encoding TO 'UTF8';
BEGIN;

-- 1. 대상 3캐릭터 확인
SELECT id, name, level, node_points,
       (SELECT COUNT(*) FROM character_nodes WHERE character_id=c.id) AS allocated
FROM characters c WHERE id IN (824, 870, 648);

-- 2. 노드 할당 전체 삭제
DELETE FROM character_nodes WHERE character_id IN (824, 870, 648);

-- 3. node_points = level - 1 로 재설정
UPDATE characters SET node_points = GREATEST(0, level - 1) WHERE id IN (824, 870, 648);

-- 4. 노드 스크롤 +8 (item_id=321) 우편 지급
INSERT INTO mailbox (character_id, subject, body, item_id, item_quantity, gold)
SELECT id, '[운영자] 노드 초기화 보상', '비정상 노드 포인트 수정에 따른 보상입니다.\n노드 스크롤 +8 1개를 드립니다.', 321, 1, 0
FROM characters WHERE id IN (824, 870, 648);

-- 5. 결과 확인
SELECT id, name, level, node_points,
       (SELECT COUNT(*) FROM character_nodes WHERE character_id=c.id) AS allocated
FROM characters c WHERE id IN (824, 870, 648);

COMMIT;
