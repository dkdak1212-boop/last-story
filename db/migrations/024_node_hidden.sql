-- 노드 비공개(어드민 전용) 필드 추가
ALTER TABLE node_definitions ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
