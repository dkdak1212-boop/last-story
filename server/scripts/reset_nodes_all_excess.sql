SET client_encoding TO 'UTF8';
BEGIN;

-- 초과 캐릭터 목록 임시 테이블
CREATE TEMP TABLE excess_chars AS
SELECT c.id
FROM characters c
LEFT JOIN (
  SELECT character_id, COUNT(*)::int AS cnt FROM character_nodes GROUP BY character_id
) n ON n.character_id = c.id
WHERE (c.node_points + COALESCE(n.cnt, 0)) > c.level;

SELECT COUNT(*) AS target_count FROM excess_chars;

-- 1. 노드 할당 삭제
DELETE FROM character_nodes WHERE character_id IN (SELECT id FROM excess_chars);

-- 2. node_points = level 로 재설정
UPDATE characters SET node_points = level WHERE id IN (SELECT id FROM excess_chars);

-- 3. 노드 스크롤 +8 우편 지급
INSERT INTO mailbox (character_id, subject, body, item_id, item_quantity, gold)
SELECT id, '[운영자] 노드 초기화 보상',
       E'비정상 노드 포인트 수정에 따른 보상입니다.\n노드 스크롤 +8 1개를 드립니다.',
       321, 1, 0
FROM excess_chars;

-- 결과 검증
SELECT COUNT(*) FILTER (WHERE (c.node_points + COALESCE(n.cnt, 0)) > c.level) AS still_excess,
       COUNT(*) AS total_checked
FROM characters c
LEFT JOIN (
  SELECT character_id, COUNT(*)::int AS cnt FROM character_nodes GROUP BY character_id
) n ON n.character_id = c.id
WHERE c.id IN (SELECT id FROM excess_chars);

COMMIT;
