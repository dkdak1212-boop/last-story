-- 소환사 스킬 개편 v1 (2026-04-28)
-- 1) 총공격(164) → 정령의 가호 (자기+소환수 마공 +50%, 6행동, 쿨 7)
-- 2) 영혼 폭풍(172) → 정령의 보호 (받는 데미지 -50%, 6행동, 쿨 9)
-- 3) 모든 소환수 effect_value (MATK 계수) ×1.5
--    158 늑대 / 159 골렘 / 161 독수리 / 163 불정령 / 165 수호수
--    167 드래곤 / 168 희생 / 169 피닉스 / 171 하이드라
--    173 고대 용 / 194 얼음 여왕 / 195 뇌신 / 196 대지 거신
--    197 천상의 수호자 / 198 시공의 지배자

BEGIN;

-- 정령의 가호 (총공격 → 변환)
UPDATE skills
   SET name = '정령의 가호',
       kind = 'buff',
       effect_type = 'spirit_blessing',
       effect_value = 50,
       effect_duration = 6,
       damage_mult = 0,
       cooldown_actions = 7,
       description = '자기 + 모든 소환수 마법공격력 +50% (6행동) · 쿨 7행동'
 WHERE id = 164;

-- 정령의 보호 (영혼 폭풍 → 변환)
UPDATE skills
   SET name = '정령의 보호',
       kind = 'buff',
       effect_type = 'damage_reduce',
       effect_value = 50,
       effect_duration = 6,
       damage_mult = 0,
       cooldown_actions = 9,
       description = '받는 데미지 -50% (6행동) · 쿨 9행동'
 WHERE id = 172;

-- 소환수 MATK 계수 ×1.5 (effect_value 만)
UPDATE skills
   SET effect_value = ROUND(effect_value * 1.5, 2)
 WHERE id IN (158, 159, 161, 163, 165, 167, 168, 169, 171, 173, 194, 195, 196, 197, 198);

-- 소환수 description 도 업데이트 — 변경된 MATK% 반영. 단순 텍스트 갱신.
-- (description 이 "MATK x80%" 같은 형식으로 박혀있어 수동 매핑)
UPDATE skills SET description = '[대지] 소환 (MATK x120%, 10행동) · 기본기' WHERE id = 158;
UPDATE skills SET description = '[대지] 탱커 소환 (MATK x120%, 16행동, 받는 데미지 -20%) · 쿨 2행동' WHERE id = 159;
UPDATE skills SET description = '[번개] 소환 (MATK x225%, 8행동) · 쿨 2행동' WHERE id = 161;
UPDATE skills SET description = '[화염] 소환 + 화상 도트 (MATK x210%, 12행동) · 쿨 3행동' WHERE id = 163;
UPDATE skills SET description = '[신성] 수호수 소환 (MATK x105%, 20행동, 매 행동 HP 5% 회복) · 쿨 5행동' WHERE id = 165;
UPDATE skills SET description = '[화염] 소환 + 화상 도트 (MATK x360%, 10행동) · 쿨 6행동' WHERE id = 167;
UPDATE skills SET description = '가장 강한 소환수 희생 → MATK x825% 폭발 · 쿨 8행동' WHERE id = 168;
UPDATE skills SET description = '[신성] 소환 (MATK x300%, 16행동) · 쿨 7행동' WHERE id = 169;
UPDATE skills SET description = '[빙결] 소환 (MATK x130% × 3연타, 12행동) · 쿨 6행동' WHERE id = 171;
UPDATE skills SET description = '[암흑] 소환 (MATK x525%, 12행동) · 쿨 8행동' WHERE id = 173;
UPDATE skills SET description = '[빙결] 소환 (MATK x375%, 12행동) · 쿨 10행동' WHERE id = 194;
UPDATE skills SET description = '[번개] 소환 (MATK x420%, 12행동) · 쿨 11행동' WHERE id = 195;
UPDATE skills SET description = '[대지] 탱커 소환 (MATK x300%, 20행동, 받는 데미지 -20%) · 쿨 11행동' WHERE id = 196;
UPDATE skills SET description = '[신성] 수호수 소환 (MATK x375%, 20행동, 매 행동 HP 5% 회복) · 쿨 12행동' WHERE id = 197;
UPDATE skills SET description = '[암흑] 소환 (MATK x300% × 3연타, 16행동) · 쿨 15행동' WHERE id = 198;

COMMIT;
