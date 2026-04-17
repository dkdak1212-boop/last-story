SET client_encoding TO 'UTF8';
BEGIN;

-- 전체 캐릭터 수 확인
SELECT COUNT(*) AS total_chars FROM characters;

-- 1. 노드 할당 전체 삭제
DELETE FROM character_nodes;

-- 2. node_points = level 로 재설정
UPDATE characters SET node_points = level;

-- 3. 노드 스크롤 +8 (id=321) 전 캐릭터 우편 발송
INSERT INTO mailbox (character_id, subject, body, item_id, item_quantity, gold)
SELECT id,
       '[운영자] 전체 노드 초기화 보상',
       E'노드 트리 시스템 정비를 위해 전체 노드를 초기화했습니다.\n노드 포인트는 레벨에 맞게 재설정되었습니다.\n보상으로 노드 스크롤 +8 1개를 드립니다.',
       321, 1, 0
FROM characters;

-- 검증: 초과 캐릭터 0이어야 함
SELECT COUNT(*) AS still_excess
FROM characters c
LEFT JOIN (SELECT character_id, COUNT(*)::int AS cnt FROM character_nodes GROUP BY character_id) n ON n.character_id = c.id
WHERE (c.node_points + COALESCE(n.cnt, 0)) > c.level;

-- 검증: 노드 할당 0이어야 함
SELECT COUNT(*) AS remaining_allocated FROM character_nodes;

COMMIT;
