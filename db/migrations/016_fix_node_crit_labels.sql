-- 노드 트리 치명타 관련 용어 통일
-- "치명타" → "치명타 확률", "치명타데미지" → "치명타 데미지"

UPDATE node_definitions
SET description = '치명타 확률 +25%, 치명타 데미지 +50%, 공격력 -10%'
WHERE name = '집중의 경지';
