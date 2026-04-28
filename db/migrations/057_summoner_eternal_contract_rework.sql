-- 소환사 전용 노드 354 영원의 계약자 효과 변경 (2026-04-28)
-- 기존: summon_infinite (소환수 지속 무한) + summon_amp +30%
-- 변경: summon_amp +60% (단일, huge tier 답게 강력)
-- 사유: 모든 소환수 공격 (skill 160) 패치로 쿨 1행동마다 소환수 지속 +1행동 제공.
--       summon_infinite 효과가 사실상 중복되어 노드 슬롯 낭비.

UPDATE node_definitions
   SET effects = '[{"key":"summon_amp","type":"passive","value":60}]'::jsonb,
       description = '소환수 데미지 +60%'
 WHERE id = 354;
