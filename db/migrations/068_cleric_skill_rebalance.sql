-- 성직자 스킬 리밸런스 (2026-04-29)
-- 1) 빛의 축복: 즉시 HP 50% 회복 효과 삭제 (engine 변경 동반) — description 정리
-- 2) 신의 타격: HP 계수 25 → 20
-- 3) 천상 강림: 기본 HP 계수 20 → 15 (마지막 1타 폭격 ×50 유지)
-- 쉴드 중첩 불가는 engine 단에서 처리.

UPDATE skills SET description = '자기 공격력 +50% (3행동) · 쿨 10행동 · 자유행동'
 WHERE class_name = 'cleric' AND name = '빛의 축복';

UPDATE skills SET description = '본인 최대 HP × 20 × 4연타 (크리티컬 발동 가능). 사용 시 천상 강림 쿨다운 -1행동 · 쿨 3행동'
 WHERE class_name = 'cleric' AND name = '신의 타격';

UPDATE skills SET description = '본인 최대 HP × 15 × 7연타 + 마지막 1타 추가 max_hp × 50 폭격 (마지막 치명 확정) · 쿨 11행동'
 WHERE class_name = 'cleric' AND name = '천상 강림';
