-- 086: 대소환사 (summoner_v2) — 어드민 전용 직업 스킬 20개
-- 5레벨마다 1개씩, 카테고리: 명령(공격) · 술식(버프) · 자세(생존)
-- 모든 효과는 기존 effect_type 만 사용 (구현된 시스템 활용)

BEGIN;

INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration, icon) VALUES
-- ── 명령 (공격/제어) ──
('summoner_v2', '명령: 습격',     '소환수가 적을 강타한다. 강한 일격 + 3턴 도트.',                          5,  3.00, 'damage',        3, 0, 'summon_dot',     0.30, 3,  ''),
('summoner_v2', '술식: 결속',     '술자가 영혼을 다잡아 체력 50%를 회복한다.',                              10, 0.00, 'heal',          5, 0, 'heal_pct',       0.50, 0,  ''),
('summoner_v2', '명령: 강습',     '소환수가 적 단일에게 강력한 일격을 내려친다 (×2.5).',                     15, 2.50, 'damage',        3, 0, 'summon',         2.50, 0,  ''),
('summoner_v2', '명령: 수호',     '술자에게 5턴간 25% 쉴드를 부여한다.',                                    20, 0.00, 'buff',          4, 0, 'shield',         0.25, 5,  ''),
('summoner_v2', '술식: 인내',     '4턴간 받는 피해 35% 감소.',                                              25, 0.00, 'damage_reduce', 5, 0, 'damage_reduce',  0.35, 4,  ''),
('summoner_v2', '명령: 추격',     '소환수가 즉시 추가 1회 행동한다.',                                        30, 0.00, 'buff',          4, 0, 'summon_extend',  1.00, 0,  ''),
('summoner_v2', '자세: 통찰',     '다음 평타 1회 치명타 확정.',                                              35, 0.00, 'buff',          3, 0, 'crit_guaranteed',1.00, 1,  ''),
('summoner_v2', '명령: 희생',     '술자가 체력 50%를 잃는 대신, 5턴간 소환수 데미지 ×3.',                    40, 3.00, 'damage',        6, 0, 'summon_sacrifice',0.50, 5,  ''),
('summoner_v2', '술식: 근력 강화','5턴간 소환수 데미지 +50%.',                                               45, 0.00, 'buff',          4, 0, 'summon_buff',    1.50, 5,  ''),
('summoner_v2', '술식: 각력 강화','5턴간 소환수 속도 +30% (행동 가속).',                                     50, 0.00, 'buff',          4, 0, 'summon_buff',    1.30, 5,  ''),
('summoner_v2', '술식: 폭주',     '3턴간 소환수 데미지 +100%, 종료 후 1턴 데미지 -50%.',                     55, 0.00, 'buff',          6, 0, 'summon_frenzy',  2.00, 3,  ''),
('summoner_v2', '술식: 응결',     '3턴간 소환수 데미지 +75%.',                                               60, 0.00, 'buff',          6, 0, 'summon_buff',    1.75, 3,  ''),
('summoner_v2', '자세: 집중',     '5턴간 자가 치명타 확률 +25.',                                              65, 0.00, 'buff',          5, 0, 'self_cri_buff',  25.0, 5,  ''),
('summoner_v2', '자세: 방어',     '5턴간 받는 피해 30% 감소.',                                                70, 0.00, 'damage_reduce', 5, 0, 'damage_reduce',  0.30, 5,  ''),
('summoner_v2', '자세: 불굴',     '5턴간 받는 피해 50% 감소.',                                                75, 0.00, 'damage_reduce', 6, 0, 'damage_reduce',  0.50, 5,  ''),
('summoner_v2', '자세: 휴식',     '10턴간 매 턴 최대 HP의 10% 회복.',                                         80, 0.00, 'heal',          8, 0, 'heal_pct',       0.10, 10, ''),
('summoner_v2', '술식: 시력 강화','5턴간 소환수 치명타 데미지 +50%.',                                         85, 0.00, 'buff',          5, 0, 'summon_buff',    1.50, 5,  ''),
('summoner_v2', '술식: 가시화',   '3턴간 받는 피해 100% 반사.',                                               90, 0.00, 'buff',          7, 0, 'damage_reflect', 1.00, 3,  ''),
('summoner_v2', '자세: 진언',     '5턴간 자가 공격력 +50%.',                                                  95, 0.00, 'buff',          9, 0, 'self_atk_buff',  0.50, 5,  ''),
('summoner_v2', '명령: 영역 선포','5턴간 술자에게 75% 쉴드. 패시브 대정의의 영역.',                          100, 0.00, 'buff',          8, 0, 'shield',         0.75, 5,  '');

COMMIT;
