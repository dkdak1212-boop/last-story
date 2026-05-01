SET client_encoding TO 'UTF8';
BEGIN;

-- ============================================================
-- 노드 흡혈 효과 일괄 제거 + 다른 효과로 대체
-- 대체 키: crit_lifesteal → crit_damage / 일반 흡혈 → str / 오오라 흡혈 → summon_amp / cleric → heal_amp
-- ============================================================

-- 72 흡혈 본능 (- medium): 치명타 흡혈 +5% → 치명타 데미지 +10%
UPDATE node_definitions SET
  effects = E'[{"key":"crit_damage","type":"passive","value":10}]'::jsonb,
  description = E'치명타 데미지 +10%'
WHERE id = 72;

-- 308 신의 심판 (cleric huge): judge_amp 25, crit_damage 20, crit_lifesteal 20 → judge_amp 25, crit_damage 20, heal_amp 30
UPDATE node_definitions SET
  effects = E'[{"key":"judge_amp","type":"passive","value":25},{"key":"crit_damage","type":"passive","value":20},{"key":"heal_amp","type":"passive","value":30}]'::jsonb,
  description = E'스킬 데미지 +25%, 치명타 데미지 +20%, 회복량 +30%'
WHERE id = 308;

-- 762 광채의 화신 (cleric huge): int 30, heal_amp 40, crit_lifesteal 25 → int 30, heal_amp 65
UPDATE node_definitions SET
  effects = E'[{"key":"int","type":"stat","value":30},{"key":"heal_amp","type":"passive","value":65}]'::jsonb,
  description = E'지능 +30, 회복량 +65%'
WHERE id = 762;

-- 766 암살자의 진수 (rogue huge): dex 25, cri 5, chain_action_amp 30, crit_lifesteal 20 → dex 25, cri 5, chain_action_amp 30, crit_damage 30
UPDATE node_definitions SET
  effects = E'[{"key":"dex","type":"stat","value":25},{"key":"cri","type":"stat","value":5},{"key":"chain_action_amp","type":"passive","value":30},{"key":"crit_damage","type":"passive","value":30}]'::jsonb,
  description = E'민첩 +25, 치명타 확률 +5%, 연계 행동 증폭 +30%, 치명타 데미지 +30%'
WHERE id = 766;

-- 773 사형 선고 (rogue medium): armor_pierce 12, crit_lifesteal 4 → armor_pierce 12, crit_damage 8
UPDATE node_definitions SET
  effects = E'[{"key":"armor_pierce","type":"passive","value":12},{"key":"crit_damage","type":"passive","value":8}]'::jsonb,
  description = E'방어 관통 +12%, 치명타 데미지 +8%'
WHERE id = 773;

-- 810 사형집행인 (rogue large): crit_lifesteal 3, armor_pierce 8 → crit_damage 6, armor_pierce 8
UPDATE node_definitions SET
  effects = E'[{"key":"crit_damage","type":"passive","value":6},{"key":"armor_pierce","type":"passive","value":8}]'::jsonb,
  description = E'치명타 데미지 +6%, 방어 관통 +8%'
WHERE id = 810;

-- 821 완전한 암살자 (rogue medium): crit_damage 15, crit_lifesteal 4 → crit_damage 23 (15+8 통합)
UPDATE node_definitions SET
  effects = E'[{"key":"crit_damage","type":"passive","value":23}]'::jsonb,
  description = E'치명타 데미지 +23%'
WHERE id = 821;

-- 866 피의 축제 (rogue small): crit_lifesteal 3 → crit_damage 5
UPDATE node_definitions SET
  effects = E'[{"key":"crit_damage","type":"passive","value":5}]'::jsonb,
  description = E'치명타 데미지 +5%'
WHERE id = 866;

-- 870 피의 군주 (rogue large): combo_kill_bonus 10, crit_lifesteal 4, poison_amp 10 → combo_kill_bonus 10, crit_damage 8, poison_amp 10
UPDATE node_definitions SET
  effects = E'[{"key":"combo_kill_bonus","type":"passive","value":10},{"key":"crit_damage","type":"passive","value":8},{"key":"poison_amp","type":"passive","value":10}]'::jsonb,
  description = E'연속킬 +10%, 치명타 데미지 +8%, 독 증폭 +10%'
WHERE id = 870;

-- 890 그림자 흡혈 (rogue medium): crit_lifesteal 3 → crit_damage 5. 이름도 변경 권장하나 그대로 두고 desc만 변경
UPDATE node_definitions SET
  effects = E'[{"key":"crit_damage","type":"passive","value":5}]'::jsonb,
  description = E'치명타 데미지 +5%',
  name = E'그림자 일격'
WHERE id = 890;

-- 351 영혼의 지배자 (summoner large): aura_lifesteal 10, summon_amp 30 → summon_amp 45 (30+15)
UPDATE node_definitions SET
  effects = E'[{"key":"summon_amp","type":"passive","value":45}]'::jsonb,
  description = E'소환수 데미지 +45%'
WHERE id = 351;

-- 356 맹수의 의지 (summoner large): summon_amp 35, aura_lifesteal 10 → summon_amp 50
UPDATE node_definitions SET
  effects = E'[{"key":"summon_amp","type":"passive","value":50}]'::jsonb,
  description = E'소환수 데미지 +50%'
WHERE id = 356;

-- 408 맹수의 의지 (summoner large): summon_amp 35, aura_lifesteal 10 → summon_amp 50
UPDATE node_definitions SET
  effects = E'[{"key":"summon_amp","type":"passive","value":50}]'::jsonb,
  description = E'소환수 데미지 +50%'
WHERE id = 408;

-- 506 맹수의 의지 (summoner large): summon_amp 35, aura_lifesteal 10 → summon_amp 50
UPDATE node_definitions SET
  effects = E'[{"key":"summon_amp","type":"passive","value":50}]'::jsonb,
  description = E'소환수 데미지 +50%'
WHERE id = 506;

-- 371 소환수 흡혈 (summoner medium): aura_lifesteal 5 → summon_amp 8
UPDATE node_definitions SET
  effects = E'[{"key":"summon_amp","type":"passive","value":8}]'::jsonb,
  description = E'소환수 데미지 +8%',
  name = E'소환수 강화 M'
WHERE id = 371;

-- 465 소환수 흡혈 (summoner medium): aura_lifesteal 5 → summon_amp 8
UPDATE node_definitions SET
  effects = E'[{"key":"summon_amp","type":"passive","value":8}]'::jsonb,
  description = E'소환수 데미지 +8%',
  name = E'소환수 강화 M'
WHERE id = 465;

-- 521 소환수 흡혈 (summoner medium): aura_lifesteal 5 → summon_amp 8
UPDATE node_definitions SET
  effects = E'[{"key":"summon_amp","type":"passive","value":8}]'::jsonb,
  description = E'소환수 데미지 +8%',
  name = E'소환수 강화 M'
WHERE id = 521;

-- 479 소환수 흡혈 (summoner small): aura_lifesteal 2 → summon_amp 3
UPDATE node_definitions SET
  effects = E'[{"key":"summon_amp","type":"passive","value":3}]'::jsonb,
  description = E'소환수 데미지 +3%',
  name = E'소환수 강화 S'
WHERE id = 479;

-- 530 소환수 흡혈 (summoner small): aura_lifesteal 2 → summon_amp 3
UPDATE node_definitions SET
  effects = E'[{"key":"summon_amp","type":"passive","value":3}]'::jsonb,
  description = E'소환수 데미지 +3%',
  name = E'소환수 강화 S'
WHERE id = 530;

-- 539 소환수 흡혈 (summoner small): aura_lifesteal 2 → summon_amp 3
UPDATE node_definitions SET
  effects = E'[{"key":"summon_amp","type":"passive","value":3}]'::jsonb,
  description = E'소환수 데미지 +3%',
  name = E'소환수 강화 S'
WHERE id = 539;

-- 550 오오라 흡혈 (summoner small): aura_lifesteal 3 → summon_amp 5
UPDATE node_definitions SET
  effects = E'[{"key":"summon_amp","type":"passive","value":5}]'::jsonb,
  description = E'소환수 데미지 +5%',
  name = E'소환수 오오라'
WHERE id = 550;

-- 741 흡혈 오오라 M (summoner medium): aura_lifesteal 10 → summon_amp 15
UPDATE node_definitions SET
  effects = E'[{"key":"summon_amp","type":"passive","value":15}]'::jsonb,
  description = E'소환수 데미지 +15%',
  name = E'소환수 강화 오오라 M'
WHERE id = 741;

-- 748 암흑의 계약 (summoner large): summon_dark_lifesteal 40 → summon_amp 50
UPDATE node_definitions SET
  effects = E'[{"key":"summon_amp","type":"passive","value":50}]'::jsonb,
  description = E'소환수 데미지 +50%',
  name = E'암흑의 계약'
WHERE id = 748;

-- 163 전사 흡혈 강화 (warrior medium): lifesteal_pct 15 → str 15
UPDATE node_definitions SET
  effects = E'[{"key":"str","type":"stat","value":15}]'::jsonb,
  description = E'힘 +15',
  name = E'전사 강화'
WHERE id = 163;

\echo === AFTER: 흡혈 잔여 ===
SELECT id, name, description FROM node_definitions
 WHERE effects::text LIKE '%lifesteal%' OR description LIKE E'%흡혈%';

\echo === 변경 결과 ===
SELECT id, name, description FROM node_definitions
 WHERE id IN (72,308,762,766,773,810,821,866,870,890,351,356,408,506,371,465,521,479,530,539,550,741,748,163)
 ORDER BY id;

COMMIT;
