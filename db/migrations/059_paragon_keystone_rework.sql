-- 파라곤 키스톤 4종 효과 변경 (구현 niche 였던 효과 → 단순/광범위 효과로 교체) — 2026-04-28
-- 923 철의 반사 → 파괴자의 의지 (방어/마방 50% 무시)
-- 928 운명의 결박 → 고립 본능 (상태이상 적 데미지 2배)
-- 938 연쇄 진동 → 마지막 일격 (적 HP 30% 이하 시 데미지 1.6배)
-- 1008 얼음의 혀 → 혼의 강타 (매 5번째 행동 데미지 3배)
--
-- 새 패시브 키:
--   paragon_destroyer_will / paragon_isolation_instinct / paragon_last_strike / paragon_soul_strike
-- engine.ts applyDamagePrefixes / def_pierce 계산 4곳 통합 적용 완료.

UPDATE node_definitions SET
  name='파괴자의 의지',
  effects='[{"key":"paragon_destroyer_will","type":"passive","value":1}]'::jsonb,
  description='모든 공격이 적의 방어력/마법방어를 50% 무시'
 WHERE id=923;

UPDATE node_definitions SET
  name='고립 본능',
  effects='[{"key":"paragon_isolation_instinct","type":"passive","value":1}]'::jsonb,
  description='상태이상(기절/게이지 동결/명중 감소/취약 등)에 걸린 적에게 모든 데미지 2배'
 WHERE id=928;

UPDATE node_definitions SET
  name='마지막 일격',
  effects='[{"key":"paragon_last_strike","type":"passive","value":1}]'::jsonb,
  description='적 HP 30% 이하일 때 모든 데미지 1.6배'
 WHERE id=938;

UPDATE node_definitions SET
  name='혼의 강타',
  effects='[{"key":"paragon_soul_strike","type":"passive","value":1}]'::jsonb,
  description='매 5번째 행동마다 데미지 3배'
 WHERE id=1008;
