-- 패시브 노드 설명 개선 (쉬운 한글)
UPDATE node_definitions SET description = '치명타 발동 시 추가 데미지 +3%' WHERE effects::text LIKE '%crit_damage%' AND effects::text LIKE '%"value": 3%' AND description LIKE '%치명%';
UPDATE node_definitions SET description = 'HP가 40% 이하일 때 방어력 25% 증가' WHERE effects::text LIKE '%guard_instinct%';
UPDATE node_definitions SET description = '적 방어력 15% 무시하고 공격' WHERE id = 32;
UPDATE node_definitions SET description = '독/출혈 등 지속 피해를 15% 덜 받음' WHERE id = 33;
UPDATE node_definitions SET description = '독/출혈 등 지속 피해 5%씩 덜 받음' WHERE effects::text LIKE '%dot_resist%' AND effects::text LIKE '%"value": 5%';
UPDATE node_definitions SET description = '지속 피해를 20% 덜 받음' WHERE id = 109;
UPDATE node_definitions SET description = '물리 공격 시 3행동 동안 출혈 (추가 피해)' WHERE id = 69;
UPDATE node_definitions SET description = '마법 스킬 데미지 20% 증가' WHERE id = 70;
UPDATE node_definitions SET description = '모든 스킬 쿨타임 1행동 감소' WHERE id = 71;
UPDATE node_definitions SET description = '치명타 발동 시 HP 5% 회복' WHERE id = 72;
UPDATE node_definitions SET description = '적에게 주는 독/출혈 피해 30% 증가' WHERE id = 108;
-- 전사
UPDATE node_definitions SET description = '출혈 피해 40% 증가' WHERE id = 162;
UPDATE node_definitions SET description = '흡혈량 15% 증가' WHERE id = 163;
UPDATE node_definitions SET description = '반사 데미지 20% 증가' WHERE id = 164;
UPDATE node_definitions SET description = '실드 흡수량 30% 증가' WHERE id = 165;
UPDATE node_definitions SET description = '다단히트 스킬 +1회 추가 타격' WHERE id = 166;
UPDATE node_definitions SET description = '자해 스킬의 HP 소모 20% 감소' WHERE id = 167;
UPDATE node_definitions SET description = 'HP 30% 이하일 때 공격력 60% 증가' WHERE id = 174;
UPDATE node_definitions SET description = '물리 데미지 35% 증가, 흡혈 10% 추가' WHERE id = 175;
UPDATE node_definitions SET description = '받는 피해의 30%를 적에게 반사 (상시)' WHERE id = 176;
UPDATE node_definitions SET description = '공격력 40% 증가, 속도 +60, 방어력 20% 감소' WHERE id = 131;
UPDATE node_definitions SET description = '방어력 50% 증가, 체력 +25, 속도 -20%' WHERE id = 132;
-- 마법사
UPDATE node_definitions SET description = '독/출혈 피해 40% 증가' WHERE id = 204;
UPDATE node_definitions SET description = '게이지 리셋/동결 효과 30% 강화' WHERE id = 205;
UPDATE node_definitions SET description = '스턴 지속시간 +1행동' WHERE id = 206;
UPDATE node_definitions SET description = '게이지 동결 지속시간 +1행동' WHERE id = 207;
UPDATE node_definitions SET description = '화상(도트) 데미지 50% 증가' WHERE id = 208;
UPDATE node_definitions SET description = '냉기 스킬의 속도 감소 효과 15% 강화' WHERE id = 209;
UPDATE node_definitions SET description = '도트 데미지 80% 증가, 도트 지속 +1행동' WHERE id = 216;
UPDATE node_definitions SET description = '게이지 조작 효과 100% 강화, 공격 쿨타임 +2' WHERE id = 217;
UPDATE node_definitions SET description = '마법 데미지 50% 증가 (mana_flow와 합산)' WHERE id = 218;
UPDATE node_definitions SET description = '스킬 쿨타임 -1행동, 마법 공격력 소폭 증가' WHERE id = 133;
UPDATE node_definitions SET description = '치명타 확률 +25%, 치명타 데미지 +50%' WHERE id = 134;
-- 성직자
UPDATE node_definitions SET description = '회복 스킬 회복량 30% 증가' WHERE id = 246;
UPDATE node_definitions SET description = '실드 흡수량 40% 증가' WHERE id = 247;
UPDATE node_definitions SET description = '반사 데미지 25% 증가' WHERE id = 248;
UPDATE node_definitions SET description = '성직자 공격 스킬 데미지 25% 증가' WHERE id = 249;
UPDATE node_definitions SET description = '신성 도트 데미지 40% 증가' WHERE id = 250;
UPDATE node_definitions SET description = '부활 시 HP 20% 추가 회복' WHERE id = 251;
UPDATE node_definitions SET description = '공격 스킬 데미지 45% 증가, 보조 효과 30% 감소' WHERE id = 258;
UPDATE node_definitions SET description = '실드/회복 50% 증가, 공격력 25% 감소' WHERE id = 259;
UPDATE node_definitions SET description = '공격/보조 모두 20% 증가' WHERE id = 260;
-- 도적
UPDATE node_definitions SET description = '독 도트 데미지 40% 증가' WHERE id = 288;
UPDATE node_definitions SET description = '연속행동 시 데미지 15% 증가' WHERE id = 289;
UPDATE node_definitions SET description = '연막/제어 스킬 효과 25% 강화' WHERE id = 290;
UPDATE node_definitions SET description = '독 폭발 데미지 50% 증가' WHERE id = 292;
UPDATE node_definitions SET description = '연막 지속시간 +1행동' WHERE id = 293;
UPDATE node_definitions SET description = '독 데미지 60% 증가, 물리 공격 15% 감소' WHERE id = 300;
UPDATE node_definitions SET description = '백스텝 쿨 -2, 연속행동 데미지 15% 증가' WHERE id = 301;
UPDATE node_definitions SET description = '제어 스킬 50% 강화, 적 속도 30% 감소' WHERE id = 302;
