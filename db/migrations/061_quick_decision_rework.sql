-- 빠른 결단 (993) 효과 변경 (2026-04-28)
-- 기존: 게이지 50% 시점 행동 가능 (게이지 절반 차감), 모든 데미지 -30%
-- 변경: 현재 속도 +50%, 모든 데미지 -30%
-- 게이지 차감은 정상화 (engine.ts 에서 GAUGE_MAX 그대로 차감), spd × 1.5 (character.ts 에서 적용)

UPDATE node_definitions
   SET description = '현재 속도 +50%, 모든 데미지 −30%'
 WHERE id = 993;
