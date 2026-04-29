-- 도적 스킬 리밸런스 (2026-04-29)
-- 1) 치명 절격: 8.78배 → 15배, 30% 확률 2회 → 50%
-- 2) 암흑의 심판: 독 스택당 +% 제거, 20.8배 → 30배 × 2연타, 적 HP 30%↓ 즉사 (보스/PVP 제외, engine 처리)

UPDATE skills
   SET damage_mult = 15.00,
       effect_value = 50.00,
       description = '15배 데미지 · 50% 확률 2회 발동 · 쿨 9행동'
 WHERE class_name = 'rogue' AND name = '치명 절격';

UPDATE skills
   SET damage_mult = 30.00,
       effect_type = 'multi_hit',
       effect_value = 2.00,
       description = '30배 데미지 × 2연타 · 적 HP 30% 이하시 즉사(보스 제외) · 쿨 11행동'
 WHERE class_name = 'rogue' AND name = '암흑의 심판';
