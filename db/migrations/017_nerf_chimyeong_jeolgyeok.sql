-- 치명 절격: 2회 발동 확률 100% -> 30% 하향
UPDATE skills
   SET effect_value = 30,
       description = '8.78배 데미지 · 30% 확률 2회 발동 · 쿨 9행동'
 WHERE id = 192;
