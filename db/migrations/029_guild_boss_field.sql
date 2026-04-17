-- 길드 보스 Phase 4b 후속 — combat_sessions.field_id FK 제약 충족용 전용 필드
-- 보스 세션은 spawnMonsterForSession에서 field 풀을 무시하고 가상 보스를 스폰하므로
-- monster_pool은 비어있어도 무관함.

INSERT INTO fields (id, name, required_level, monster_pool, description)
VALUES (999, '길드 보스', 1, '[]'::jsonb, '길드 전용 보스 — 입장키로만 진입')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;
