-- 도적 스킬 쿨다운 단축 (2026-04-29)
-- 천 개의 칼날 8 → 6, 치명 절격 9 → 7, 암흑의 심판 11 → 8

UPDATE skills
   SET cooldown_actions = 6,
       description = '4.29배 × 7연타 + 독 부여 · 쿨 6초'
 WHERE class_name = 'rogue' AND name = '천 개의 칼날';

UPDATE skills
   SET cooldown_actions = 7,
       description = '15배 데미지 · 50% 확률 2회 발동 · 쿨 7초'
 WHERE class_name = 'rogue' AND name = '치명 절격';

UPDATE skills
   SET cooldown_actions = 8,
       description = '30배 데미지 × 2연타 · 적 HP 30% 이하시 즉사(보스 제외) · 쿨 8초'
 WHERE class_name = 'rogue' AND name = '암흑의 심판';
