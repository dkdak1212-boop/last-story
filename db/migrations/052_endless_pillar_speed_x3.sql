-- 종언의 기둥 — 모든 몬스터 (일반 5 + 보스 10) spd ×3
-- 사유: 게이지 충전 속도가 너무 느려 1분 안에 보스 처치 위주가 어려움.
-- 행동 빈도를 3배로 끌어올려 도전 강도 + 컨텐츠 밀도 향상.
-- HP/공격력 항목은 별개 — 너프 (051) 그대로 유지.
-- 2026-04-27

UPDATE monsters
   SET stats = jsonb_set(stats, '{spd}', to_jsonb(COALESCE((stats->>'spd')::int, 100) * 3))
 WHERE id BETWEEN 503 AND 517;
