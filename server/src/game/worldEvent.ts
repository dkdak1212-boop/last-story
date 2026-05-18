import { query } from '../db/pool.js';
import { loadCharacter, getEffectiveStats } from './character.js';
import { addItemToInventory, deliverToMailbox } from './inventory.js';
import { applyExpGain } from './leveling.js';
import { clampCharacterPoints } from './pointClamper.js';
import type { Server } from 'socket.io';
import type { StatusEffect } from '../combat/shared.js';
import { calcDotTickDamage, buildDotEntry, decrementEffects } from '../combat/shared.js';

const ATTACK_COOLDOWN_MS = 10_000; // 10초 쿨다운
const DEATH_COOLDOWN_MS = 3_600_000; // 사망 시 1시간 쿨다운 (raid-bosses-v2, 2026-05-17)
// 일일 입장 1회 제한 (2026-05-18) — 1 event = 하루 1회. attack_count >= 1 이면 재입장 거절.
const MAX_ENTRIES_PER_EVENT = 1;

// raid-bosses-v2: 보스 행동 시점에 사용. spawn 후 t초 → 광폭화 단계 = floor(t/30), 데미지 = base × 2^단계
function calcEnrageStage(startedAtMs: number): number {
  const elapsedSec = Math.max(0, (Date.now() - startedAtMs) / 1000);
  return Math.floor(elapsedSec / 30);
}
function enrageMul(stage: number): number {
  // 무한 누적 — 단계당 ×2. 단계 50 이상에서 Number.MAX_SAFE_INTEGER 근접 — cap 50 으로 안전.
  return Math.pow(2, Math.min(50, stage));
}

// ─── 활성 이벤트 조회 ───
export async function getActiveEvent() {
  const r = await query<{
    id: number; boss_id: number; current_hp: number; max_hp: number;
    started_at: string; ends_at: string; status: string;
    name: string; level: number; min_level: number;
    current_phase: number; phase_pattern: string; phase_changed_at: string;
    element_immune: string | null; element_weak: string | null; weak_amp_pct: number;
    dot_immune: boolean; alternating_immune: boolean; signature_skill: string | null;
  }>(
    `SELECT e.id, e.boss_id, e.current_hp, e.max_hp, e.started_at, e.ends_at, e.status,
            b.name, b.level, b.min_level,
            e.current_phase, e.phase_pattern, e.phase_changed_at,
            b.element_immune, b.element_weak, COALESCE(b.weak_amp_pct, 0) AS weak_amp_pct,
            COALESCE(b.dot_immune, FALSE) AS dot_immune,
            COALESCE(b.alternating_immune, FALSE) AS alternating_immune,
            b.signature_skill
     FROM world_event_active e
     JOIN world_event_bosses b ON b.id = e.boss_id
     WHERE e.status = 'active'
     ORDER BY e.id DESC LIMIT 1`
  );
  return r.rows[0] ?? null;
}

// ─── 10초 전투 시뮬레이션 ───
export async function attackBoss(characterId: number) {
  const event = await getActiveEvent();
  if (!event) return { error: '진행 중인 레이드가 없습니다.' };
  if (event.current_hp <= 0) return { error: '보스가 이미 쓰러졌습니다.' };

  const char = await loadCharacter(characterId);
  if (!char) return { error: '캐릭터를 찾을 수 없습니다.' };
  // 어드민 가드 제거 (2026-05-17) — 일반 유저도 진입 가능.
  if (char.level < event.min_level) return { error: `Lv.${event.min_level} 이상만 참여 가능합니다.` };

  // 쿨다운 + 일일 입장 제한 체크
  const existing = await query<{ last_attack_at: string; attack_count: number }>(
    `SELECT last_attack_at, COALESCE(attack_count, 0) AS attack_count
       FROM world_event_participants WHERE event_id = $1 AND character_id = $2`,
    [event.id, characterId]
  );
  if (existing.rows[0]) {
    // 일일 1회 입장 제한 (2026-05-18) — 같은 event 에 이미 참여했으면 거절.
    if ((existing.rows[0].attack_count ?? 0) >= MAX_ENTRIES_PER_EVENT) {
      return { error: '이미 오늘 레이드에 입장하셨습니다. (1일 1회 입장 가능)' };
    }
    const elapsed = Date.now() - new Date(existing.rows[0].last_attack_at).getTime();
    const cd = (char.hp <= 1) ? DEATH_COOLDOWN_MS : ATTACK_COOLDOWN_MS;
    if (elapsed < cd) {
      const remainMin = Math.ceil((cd - elapsed) / 60000);
      return {
        error: char.hp <= 1
          ? `사망 쿨다운 ${remainMin}분 남음`
          : '쿨다운 중입니다.',
        cooldownMs: cd - elapsed,
      };
    }
  }

  // 스탯 계산 (장비+노드+세트 전부 반영)
  const eff = await getEffectiveStats(char);
  const mageClass = ['mage', 'cleric'].includes(char.class_name);

  // 노드 패시브 로드
  const { getNodePassives } = await import('./character.js');
  const passives = await getNodePassives(characterId);
  const passiveMap = new Map(passives.map(p => [p.key, p.value]));
  const armorPierce = passiveMap.get('armor_pierce') || 0;
  const spellAmp = mageClass ? (passiveMap.get('spell_amp') || 0) : 0;
  const critDmgBonus = (passiveMap.get('crit_damage') || 0)
    + (passiveMap.get('paragon_crit_dmg_pct') || 0); // 차원의 정수 — 잔혹
  const cdReduce = passiveMap.get('cooldown_reduce') || 0;

  // 장비 접두사 특수 효과 로드
  const prefixR = await query<{ enhance_level: number; prefix_stats: Record<string, number> | null }>(
    `SELECT ce.enhance_level, ce.prefix_stats FROM character_equipped ce WHERE ce.character_id = $1`, [characterId]
  );
  const equipPrefixes: Record<string, number> = {};
  for (const row of prefixR.rows) {
    if (!row.prefix_stats) continue;
    const mult = 1 + (row.enhance_level || 0) * 0.025;
    for (const [k, v] of Object.entries(row.prefix_stats)) {
      equipPrefixes[k] = (equipPrefixes[k] || 0) + Math.round((v as number) * mult);
    }
  }
  const prefixDefReduce = equipPrefixes.def_reduce_pct || 0;
  const prefixLifesteal = equipPrefixes.lifesteal_pct || 0;
  const prefixCritDmg = equipPrefixes.crit_dmg_pct || 0;
  const prefixHpRegen = equipPrefixes.hp_regen || 0;

  // 스탯 증폭 (노드·유니크) — playerAtk 산정 전에 적용
  // poison_lord: 과거 atk -15% 페널티 제거 (역효과 버그)
  // 유니크 접두사: atk_pct / matk_pct — 공격/마법공격 % 증폭
  if (equipPrefixes.atk_pct) {
    eff.atk = Math.round(eff.atk * (1 + equipPrefixes.atk_pct / 100));
  }
  if (equipPrefixes.matk_pct) {
    eff.matk = Math.round(eff.matk * (1 + equipPrefixes.matk_pct / 100));
  }

  const playerAtk = mageClass ? eff.matk : eff.atk;
  const playerDef = eff.def;
  const playerMdef = eff.mdef;

  // 스킬 로드 — 필드 전투와 동일한 slot_order 기반 우선순위
  // (class_name + required_level + auto_use 필터, slot_order ASC 정렬)
  const skillsR = await query<{ name: string; kind: string; damage_mult: number; cooldown_actions: number; flat_damage: number; effect_type: string; effect_value: number; effect_duration: number; slot_order: number }>(
    `SELECT s.name, s.kind, s.damage_mult, s.cooldown_actions, s.flat_damage,
            s.effect_type, s.effect_value, s.effect_duration,
            COALESCE(cs.slot_order, 9999) AS slot_order
     FROM skills s
     JOIN character_skills cs ON cs.skill_id = s.id AND cs.character_id = $1
     WHERE s.class_name = $3 AND s.required_level <= $2 AND cs.auto_use = TRUE
     ORDER BY cs.slot_order ASC, s.required_level ASC`,
    [characterId, char.level, char.class_name]
  );
  // 레이드 우선순위: 쿨다운 있는 "진짜" 스킬 먼저, cd=0 기본기는 폴백.
  // 같은 그룹 내에서는 slot_order 유지 — 유저 슬롯 세팅 존중.
  // 필드 전투는 지속 전투라 cd=0 기본기 스팸이 자연스럽지만, 레이드는
  // 10초 스냅샷이라 슬롯 1이 기본기면 고위 버스트 스킬이 한 번도 안 나감.
  const allSkills = [...skillsR.rows].sort((a, b) => {
    const aFiller = a.cooldown_actions <= 0 ? 1 : 0;
    const bFiller = b.cooldown_actions <= 0 ? 1 : 0;
    if (aFiller !== bFiller) return aFiller - bFiller;
    return (a.slot_order ?? 9999) - (b.slot_order ?? 9999);
  });

  // 도트 증폭 (패시브 + 접두사) — 필드 전투 processDots와 동일 합산식
  const dotAmpPct = (passiveMap.get('dot_amp') || 0)
    + (passiveMap.get('poison_amp') || 0)
    + (passiveMap.get('bleed_amp') || 0)
    + (passiveMap.get('burn_amp') || 0)
    + (passiveMap.get('holy_dot_amp') || 0)
    + (passiveMap.get('elemental_storm') || 0)
    + (passiveMap.get('poison_lord') || 0)
    + (equipPrefixes.dot_amp_pct || 0);
  const elementalStormExt = (passiveMap.get('elemental_storm') || 0) > 0 ? 1 : 0;
  const bleedOnHitChance = passiveMap.get('bleed_on_hit') || 0;

  // raid-bosses-v2: 보스 스탯
  //  - 스피드 1000 (게이지 매우 빠름)
  //  - 공격 데미지 = 타겟 max_hp × 10% × 광폭화 멀티 (시간 기반)
  //  - HP 무한이라 페이즈는 HP% 가 아닌 광폭화 시간 단계로 대체
  const bossSpd = 1000;
  const startedAtMs = new Date(event.started_at).getTime();
  const enrageStageNow = calcEnrageStage(startedAtMs);
  const enrageMulNow = enrageMul(enrageStageNow);
  // 기존 변수 호환 (다른 곳 참조 보존). 의미는 광폭화로 대체.
  const phase = enrageStageNow >= 3 ? 3 : enrageStageNow >= 1 ? 2 : 1;
  void phase; // 페이즈 마커 — 광폭 단계로 의미 변경됨
  const baseBossDef = event.level * 2 * 3;

  // 보스 방어력 (접두사 약화 + 노드 관통 적용)
  const totalPierce = Math.min(80, armorPierce + prefixDefReduce);
  const bossDef = Math.round(baseBossDef * (1 - totalPierce / 100));

  // ── 10초 시뮬레이션 (100ms 틱) ──
  const GAUGE_MAX = 1000;
  const TICKS = 100; // 10초 = 100틱
  // 플레이어 HP: 장비/노드/세트 반영된 maxHp 기준 (전투 시작 시 풀HP)
  let playerHp = eff.maxHp;
  let playerGauge = 0;
  let bossGauge = 0;
  let totalDmgDealt = 0;
  let totalDmgReceived = 0;
  let critCount = 0;
  let actionCount = 0;
  let playerDead = false;
  const cooldowns = new Map<string, number>();
  const combatLog: string[] = [];
  // 보스에게 걸린 도트/상태이상 (플레이어→보스 단방향)
  let bossEffects: StatusEffect[] = [];
  // 시뮬 1회에 이미 발동된 버프 — cd=0 버프가 매 액션 반복 발동하는 걸 방지
  const usedBuffs = new Set<string>();

  for (let t = 0; t < TICKS; t++) {
    // 게이지 충전
    playerGauge += eff.spd * 0.2;
    bossGauge += bossSpd * 0.2;

    // 플레이어 행동
    if (playerGauge >= GAUGE_MAX) {
      playerGauge = 0;
      actionCount++;

      // 쿨다운 감소
      for (const [name, cd] of cooldowns) {
        if (cd <= 1) cooldowns.delete(name);
        else cooldowns.set(name, cd - 1);
      }

      // ── 데미지 계산 헬퍼 (한 번의 타격) ──
      const dotBase = mageClass ? eff.matk : eff.atk;
      // raid-v2 길드보스 메커닉: 교대 면역 (30초 페이즈로 physical/magical 면역)
      const altImmuneActive = (() => {
        if (!event.alternating_immune) return null as null | 'physical' | 'magical';
        const phaseIdx = Math.floor(Date.now() / 1000 / 30) % 2;
        return phaseIdx === 0 ? 'physical' : 'magical';
      })();
      const doOneHit = (sk: typeof allSkills[number], mult: number, label: string) => {
        const damageType: 'physical' | 'magical' = mageClass ? 'magical' : 'physical';
        // 교대 면역 — 해당 데미지 타입이면 0
        if (altImmuneActive === damageType) {
          if (combatLog.length < 20) combatLog.push(`[${label}] ${damageType === 'physical' ? 'ATK' : 'MATK'} 면역 페이즈 (0)`);
          return;
        }
        const isCrit = Math.random() * 100 < eff.cri;
        let dmg = Math.round((playerAtk - bossDef * 0.5) * mult * (0.9 + Math.random() * 0.2)) + (sk.flat_damage || 0);
        dmg = Math.max(1, dmg);
        if (spellAmp > 0) dmg = Math.round(dmg * (1 + spellAmp / 100));
        if (isCrit) {
          const totalCritBonus = 100 + critDmgBonus + prefixCritDmg;
          dmg = Math.round(dmg * (1 + totalCritBonus / 100));
          critCount++;
        }
        totalDmgDealt += dmg;
        if (prefixLifesteal > 0) playerHp = Math.min(eff.maxHp, playerHp + Math.round(dmg * prefixLifesteal / 100));
        if (combatLog.length < 20) combatLog.push(`[${label}] ${dmg.toLocaleString()}${isCrit ? ' (치명타!)' : ''}`);
        // 패시브: bleed_on_hit — 타격마다 출혈 (도트 면역 시 push 안 함)
        if (bleedOnHitChance > 0 && Math.random() * 100 < bleedOnHitChance && !event.dot_immune) {
          bossEffects.push(buildDotEntry({ type: 'dot', attackerBase: dotBase, multiplier: 1.2, duration: 3, source: 'player', useMatk: mageClass }));
        }
      };

      // ── HP가 낮으면 힐 스킬 비상 사용 ──
      let used = false;
      const hpPct = playerHp / eff.maxHp;
      if (hpPct < 0.4) {
        for (const sk of allSkills) {
          if (sk.effect_type !== 'heal_pct') continue;
          if ((cooldowns.get(sk.name) ?? 0) > 0) continue;
          const heal = Math.round(eff.maxHp * sk.effect_value / 100);
          playerHp = Math.min(eff.maxHp, playerHp + heal);
          if (sk.cooldown_actions > 0) cooldowns.set(sk.name, sk.cooldown_actions);
          if (combatLog.length < 20) combatLog.push(`[${sk.name}] HP +${heal.toLocaleString()} 회복`);
          used = true;
          break;
        }
      }

      // ── slot_order 순서대로 첫 번째 사용 가능한 스킬 발동 (필드와 동일 방식) ──
      if (!used) {
        for (const sk of allSkills) {
          if ((cooldowns.get(sk.name) ?? 0) > 0) continue;
          // HP 여유 있으면 힐 스킬은 스킵 (낭비 방지)
          if (sk.effect_type === 'heal_pct') continue;
          // 버프 스킬은 시뮬 1회만 발동 (cd=0 버프가 슬롯 1에서 무한 루프 나는 것 방지)
          if (sk.kind === 'buff' && usedBuffs.has(sk.name)) continue;

          // 쿨다운 설정 (노드 쿨감 적용)
          if (sk.cooldown_actions > 0) {
            const cd = Math.max(1, sk.cooldown_actions - Math.floor(cdReduce / 25));
            cooldowns.set(sk.name, cd);
          }

          // ── 스킬 유형별 처리 ──
          if (sk.kind === 'buff') {
            // 버프는 레이드 시뮬에서 간략 처리 (로그만)
            usedBuffs.add(sk.name);
            if (combatLog.length < 20) combatLog.push(`[${sk.name}] 버프 발동!`);
          } else if (sk.effect_type === 'multi_hit' || sk.effect_type === 'multi_hit_poison') {
            // 다단 타격
            const hits = Math.max(1, Math.round(sk.effect_value));
            for (let h = 0; h < hits; h++) {
              doOneHit(sk, sk.damage_mult, `${sk.name} ${h + 1}타`);
            }
            if (sk.effect_type === 'multi_hit_poison') {
              for (let h = 0; h < hits; h++) {
                bossEffects.push(buildDotEntry({ type: 'poison', attackerBase: dotBase, multiplier: 1.5, duration: 3, source: 'player', useMatk: mageClass }));
              }
            }
          } else if (sk.effect_type === 'poison_burst') {
            // 기존 독 스택의 일부를 즉시 데미지로
            const poisons = bossEffects.filter(e => e.type === 'poison' && e.source === 'player');
            let totalBurst = 0;
            for (const p of poisons) totalBurst += Math.round(p.value * sk.effect_value / 100);
            if (totalBurst > 0) {
              totalDmgDealt += totalBurst;
              if (combatLog.length < 20) combatLog.push(`[${sk.name}] 독 폭발! ${totalBurst.toLocaleString()}`);
            } else {
              if (combatLog.length < 20) combatLog.push(`[${sk.name}] 독이 없어 효과 없음`);
            }
          } else {
            // 일반 공격 스킬 (damage / dot / poison / stun / speed_mod / lifesteal / crit_bonus / hp_pct_damage / self_hp_dmg / self_damage_pct / double_chance 등)
            doOneHit(sk, sk.damage_mult, sk.name);

            // lifesteal — 데미지의 effect_value% 회복 + 동일량 추가 데미지
            if (sk.effect_type === 'lifesteal') {
              // doOneHit이 직접 dmg를 반환하지 않으므로 간략화: 추가 힐은 생략, 일반 데미지만 반영
            }
            // hp_pct_damage — raid-bosses-v2 결정: 보스에 HP% 비례 데미지 완전 차단 (0 데미지)
            if (sk.effect_type === 'hp_pct_damage') {
              if (combatLog.length < 20) combatLog.push(`[${sk.name}] 체력비례 효과 무효`);
            }
            // self_hp_dmg — 자신 최대 HP의 effect_value% 만큼 추가 데미지
            if (sk.effect_type === 'self_hp_dmg') {
              const extra = Math.round(eff.maxHp * sk.effect_value / 100);
              totalDmgDealt += extra;
              if (combatLog.length < 20) combatLog.push(`[${sk.name}] 추가 ${extra.toLocaleString()}`);
            }
            // self_damage_pct — 자신 HP 소모
            if (sk.effect_type === 'self_damage_pct') {
              const cost = Math.round(eff.maxHp * sk.effect_value / 100);
              playerHp -= cost;
              totalDmgDealt += cost; // 소모한 HP만큼 추가 데미지
              if (combatLog.length < 20) combatLog.push(`[${sk.name}] 자신 HP -${cost.toLocaleString()}, 추가 ${cost.toLocaleString()}`);
            }
            // 도트 부여 (dot / poison)
            if (sk.effect_type === 'dot') {
              const dur = (sk.effect_duration || 3) + elementalStormExt;
              bossEffects.push(buildDotEntry({ type: 'dot', attackerBase: dotBase, multiplier: 1.2, duration: dur, source: 'player', useMatk: mageClass }));
            } else if (sk.effect_type === 'poison') {
              const dur = sk.effect_duration || 3;
              bossEffects.push(buildDotEntry({ type: 'poison', attackerBase: dotBase, multiplier: 1.5, duration: dur, source: 'player', useMatk: mageClass }));
            }
          }

          used = true;
          break;
        }
      }

      // 기본 공격 (사용 가능한 스킬이 없을 때)
      if (!used) {
        const isCrit = Math.random() * 100 < eff.cri;
        let dmg = Math.round((playerAtk - bossDef * 0.5) * (0.9 + Math.random() * 0.2));
        dmg = Math.max(1, dmg);
        if (isCrit) {
          const totalCritBonus = 100 + critDmgBonus + prefixCritDmg;
          dmg = Math.round(dmg * (1 + totalCritBonus / 100));
          critCount++;
        }
        totalDmgDealt += dmg;
        if (prefixLifesteal > 0) playerHp = Math.min(eff.maxHp, playerHp + Math.round(dmg * prefixLifesteal / 100));
        if (combatLog.length < 20) combatLog.push(`[기본 공격] ${dmg.toLocaleString()}${isCrit ? ' (치명타!)' : ''}`);
      }

      // 접두사: 재생 (틱당 회복은 행동 시 적용)
      if (prefixHpRegen > 0 && playerHp < eff.maxHp) {
        playerHp = Math.min(eff.maxHp, playerHp + prefixHpRegen);
      }

      // ── 도트 틱 (플레이어 행동 시) — 필드 전투 processDots와 동일 ──
      // raid-v2: 보스 dot_immune true 시 도트 데미지 0
      if (bossEffects.length > 0 && !event.dot_immune) {
        const dotResult = calcDotTickDamage(bossEffects, 'monster', {
          defenderDef: bossDef,
          dotAmpPct,
          dotResistPct: 0,
        });
        if (dotResult.totalDamage > 0) {
          totalDmgDealt += dotResult.totalDamage;
          if (combatLog.length < 20) combatLog.push(`[도트] ${dotResult.totalDamage.toLocaleString()} 데미지 (${dotResult.count}중첩)`);
        }
        bossEffects = decrementEffects(bossEffects);
      } else if (bossEffects.length > 0 && event.dot_immune) {
        bossEffects = decrementEffects(bossEffects); // 면역이라도 잔존 턴 감소
      }
    }

    // 보스 행동 — raid-bosses-v2 Step 2: 시그니처 스킬 풀 (가중 랜덤)
    if (bossGauge >= GAUGE_MAX) {
      bossGauge = 0;
      // 발라카스 시그니처 풀 — 5종 가중 랜덤 (signature_skill 컬럼 미사용 — 향후 보스별 분기 시 활용)
      type Pattern = 'basic' | 'fire_breath' | 'tail_swipe' | 'roar' | 'inferno';
      const pickPattern = (): Pattern => {
        const r = Math.random() * 100;
        if (r < 60) return 'basic';
        if (r < 75) return 'fire_breath';
        if (r < 85) return 'tail_swipe';
        if (r < 95) return 'roar';
        return 'inferno';
      };
      const pattern = pickPattern();
      // 패턴별 데미지 비율 + 회피 무시 + 라벨. 라벨 prefix `[icon:key]` 는 클라가 픽셀 에셋으로 치환.
      const PATTERN_INFO: Record<Pattern, { mul: number; pierceDodge: boolean; label: string }> = {
        basic:       { mul: 0.035, pierceDodge: false, label: '[icon:basic]발라카스 공격' },
        fire_breath: { mul: 0.105, pierceDodge: true,  label: '[icon:fire_breath]발라카스 — 화염 브레스' },
        tail_swipe:  { mul: 0.175, pierceDodge: false, label: '[icon:tail_swipe]발라카스 — 꼬리치기' },
        roar:        { mul: 0.035, pierceDodge: false, label: '[icon:roar]발라카스 — 포효' },
        inferno:     { mul: 0.35,  pierceDodge: true,  label: '[icon:inferno]발라카스 — 융화' },
      };
      const info = PATTERN_INFO[pattern];
      // 회피 — 회피 무시 패턴은 스킵
      if (!info.pierceDodge && Math.random() * 100 < eff.dodge) {
        if (combatLog.length < 20) combatLog.push(`[회피] ${info.label} 회피!`);
        continue;
      }
      const baseDmg = Math.round(eff.maxHp * info.mul);
      const bossDmg = Math.max(1, Math.round(baseDmg * enrageMulNow));
      totalDmgReceived += bossDmg;
      playerHp -= bossDmg;
      const enrageTag = enrageStageNow > 0 ? ` [광폭 ${enrageStageNow}단계 ×${enrageMulNow}]` : '';
      if (combatLog.length < 20) {
        combatLog.push(`[${info.label}] ${bossDmg.toLocaleString()}${enrageTag} (HP: ${Math.max(0, playerHp).toLocaleString()}/${eff.maxHp.toLocaleString()})`);
      }

      if (playerHp <= 0) {
        playerDead = true;
        combatLog.push(`[사망] ${info.label}에 쓰러졌다! (5분 쿨다운)`);
        break;
      }
    }
  }
  void bossDef; // 보스 방어력 — 보스 받는 데미지에는 영향, 보스 공격에는 미사용 (고정 비례)

  // HP 업데이트 (사망 시 HP 1, max_hp로 clamp)
  const newPlayerHp = playerDead ? 1 : Math.max(1, playerHp);
  await query('UPDATE characters SET hp = LEAST($1, max_hp) WHERE id = $2', [newPlayerHp, characterId]);

  // 보스 공유 HP 감소
  const upd = await query<{ current_hp: number }>(
    `UPDATE world_event_active SET current_hp = GREATEST(0, current_hp - $1) WHERE id = $2 AND status = 'active' RETURNING current_hp`,
    [totalDmgDealt, event.id]
  );
  const newBossHp = upd.rows[0]?.current_hp ?? event.current_hp;

  // 참여자 업서트
  await query(
    `INSERT INTO world_event_participants (event_id, character_id, total_damage, attack_count, last_attack_at)
     VALUES ($1, $2, $3, 1, NOW())
     ON CONFLICT (event_id, character_id) DO UPDATE
     SET total_damage = world_event_participants.total_damage + $3,
         attack_count = world_event_participants.attack_count + 1,
         last_attack_at = NOW()`,
    [event.id, characterId, totalDmgDealt]
  );

  // 내 순위
  const myRow = await query<{ total_damage: number; attack_count: number; rank: number }>(
    `SELECT total_damage, attack_count,
            (SELECT COUNT(*) + 1 FROM world_event_participants p2
             WHERE p2.event_id = $1 AND p2.total_damage > p.total_damage)::int AS rank
     FROM world_event_participants p WHERE event_id = $1 AND character_id = $2`,
    [event.id, characterId]
  );
  const my = myRow.rows[0];

  return {
    damageDealt: totalDmgDealt,
    damageReceived: totalDmgReceived,
    actionCount,
    critCount,
    playerDead,
    playerHp: newPlayerHp,
    playerMaxHp: eff.maxHp,
    phase,
    combatLog,
    currentHp: newBossHp,
    maxHp: event.max_hp,
    myDamage: my?.total_damage ?? totalDmgDealt,
    myRank: my?.rank ?? 1,
    myAttackCount: my?.attack_count ?? 1,
    defeated: newBossHp <= 0,
  };
}

// ─── 리더보드 (직업별, 2026-05-18 개편) ───
// 클래스 내 순위 1~limit 까지 반환. 클라이언트는 클래스별 섹션/탭으로 표시.
// rank 는 클래스 내 순위. 같은 character 가 여러 클래스 보드에 노출되지 않음 (1캐릭 1클래스).
export async function getLeaderboard(eventId: number, limit = 20) {
  const r = await query<{ character_name: string; class_name: string; total_damage: number; class_rank: string }>(
    `WITH ranked AS (
       SELECT c.name AS character_name, c.class_name, p.total_damage,
              ROW_NUMBER() OVER (PARTITION BY c.class_name ORDER BY p.total_damage DESC) AS class_rank
         FROM world_event_participants p
         JOIN characters c ON c.id = p.character_id
         JOIN users u ON u.id = c.user_id
        WHERE p.event_id = $1 AND u.is_admin = FALSE
     )
     SELECT character_name, class_name, total_damage, class_rank::text
       FROM ranked
      WHERE class_rank <= $2
      ORDER BY class_name, class_rank`,
    [eventId, limit]
  );
  return r.rows.map(row => ({
    rank: Number(row.class_rank),
    characterName: row.character_name,
    className: row.class_name,
    damage: row.total_damage,
  }));
}

// ─── 보상 분배 ───
async function distributeRewards(eventId: number, mult: number = 1.0) {
  const boss = await query<{ reward_table: unknown }>(
    `SELECT b.reward_table FROM world_event_active e JOIN world_event_bosses b ON b.id = e.boss_id WHERE e.id = $1`, [eventId]
  );
  if (boss.rowCount === 0) return;
  const tiers = boss.rows[0].reward_table as Array<{
    tier: string; minRank?: number; maxRank?: number; minPct?: number; maxPct?: number;
    rewards: { itemId?: number; qty?: number; gold?: number; exp?: number };
  }>;
  const participants = await query<{ character_id: number; total_damage: number }>(
    `SELECT character_id, total_damage FROM world_event_participants WHERE event_id = $1 ORDER BY total_damage DESC`, [eventId]
  );
  const total = participants.rows.length;
  if (total === 0) return;

  for (let i = 0; i < participants.rows.length; i++) {
    const p = participants.rows[i];
    const rank = i + 1;
    const topPct = total <= 1 ? 0 : ((rank - 1) / (total - 1)) * 100;
    let matched = tiers[tiers.length - 1];
    for (const t of tiers) {
      if (t.minRank != null && t.maxRank != null && rank >= t.minRank && rank <= t.maxRank) { matched = t; break; }
      if (t.minPct != null && t.maxPct != null && topPct >= t.minPct && topPct < t.maxPct) { matched = t; break; }
    }
    const rw = matched.rewards;
    const goldAmt = rw.gold ? Math.round(rw.gold * mult) : 0;
    const expAmt = rw.exp ? Math.round(rw.exp * mult) : 0;
    if (goldAmt) await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [goldAmt, p.character_id]);
    if (expAmt) {
      const cr = await query<{ level: number; exp: string; class_name: string }>('SELECT level, exp, class_name FROM characters WHERE id = $1', [p.character_id]);
      if (cr.rows[0]) {
        const result = applyExpGain(cr.rows[0].level, Number(cr.rows[0].exp), expAmt, cr.rows[0].class_name);
        await query(
          `UPDATE characters SET level=$1, exp=$2, max_hp=max_hp+$3,
             node_points=node_points+$4,
             stat_points=COALESCE(stat_points,0)+$6
           WHERE id=$5`,
          [result.newLevel, result.newExp, result.hpGained, result.nodePointsGained, p.character_id, result.statPointsGained]
        );
        clampCharacterPoints(p.character_id).catch(() => {});
      }
    }
    if (rw.itemId && rw.qty) {
      const { overflow } = await addItemToInventory(p.character_id, rw.itemId, rw.qty);
      if (overflow > 0) await deliverToMailbox(p.character_id, `레이드 보상 (${matched.tier})`, '우편 발송', rw.itemId, overflow);
    }
    const partial = mult < 1.0 ? ' [시간만료 50%]' : '';
    await deliverToMailbox(p.character_id, `레이드 보상 (${matched.tier}등급)${partial}`,
      `순위 ${rank}위 · 데미지 ${p.total_damage.toLocaleString()}\n보상: ${goldAmt.toLocaleString()}G, 경험치 ${expAmt.toLocaleString()}`, 0, 0, 0);
  }
}

// ─── 보스 처치/만료 ───
export async function finishEvent(eventId: number, status: 'defeated' | 'expired', io?: Server) {
  // 상태 갱신 전에 보스 정보·정수 분배 먼저 (UPDATE 후엔 일부 JOIN 결과 달라질 수 있음)
  const bossR = await query<{ name: string; boss_id: number }>(
    `SELECT b.name, e.boss_id AS boss_id
       FROM world_event_active e JOIN world_event_bosses b ON b.id = e.boss_id
      WHERE e.id = $1`, [eventId]
  );

  // raid-bosses-v2 결정: 등급 보상(S/A/B/C 골드·EXP) 폐기 — 정수만 지급.
  // (distributeRewards 호출 제거. 함수 자체는 유지 — 향후 등급 부활 시 재사용)
  void distributeRewards;

  // 정수 분배 (라인 A/B 독립 굴림) — specs/raid-bosses-v2.md
  //    HP 무한 디자인이라 사실상 expired 만 발생하지만 defeated 도 동일하게 분배.
  if (bossR.rowCount) {
    const essenceName = ESSENCE_NAME_BY_BOSS[bossR.rows[0].boss_id];
    if (essenceName) {
      try { await distributeEssence(eventId, essenceName, bossR.rows[0].name); }
      catch (e) { console.error('[raid] distributeEssence err', e); }
    }
  }

  // 레이드 포인트 분배 (순위별, raid 상점 화폐로 사용 예정)
  try { await distributeRaidPoints(eventId); }
  catch (e) { console.error('[raid] distributeRaidPoints err', e); }

  await query(`UPDATE world_event_active SET status = $1, finished_at = NOW() WHERE id = $2`, [status, eventId]);
  if (io) io.emit('world_event', { type: 'world_event_end', bossName: bossR.rows[0]?.name ?? '???', result: status });
}

// 보스 id → 정수 이름 매핑 (specs/raid-bosses-v2.md)
const ESSENCE_NAME_BY_BOSS: Record<number, string> = {
  1: '발라카스의 정수',
  2: '아트라스의 정수',
  3: '카르나스의 정수',
};

// 레이드 포인트 — 직업별 순위 기준 (2026-05-18)
// 클래스 내 1~10위 1000pt · 11~20위 900 · 21~30위 800 · 31~40위 700 · 41~50위 600
// 51~60위 500 · 61~70위 400 · 71~80위 300 · 81~90위 200 · 91~100위 100 · 그 외 0
function pointsForClassRank(rank: number): number {
  if (rank <=  10) return 1000;
  if (rank <=  20) return 900;
  if (rank <=  30) return 800;
  if (rank <=  40) return 700;
  if (rank <=  50) return 600;
  if (rank <=  60) return 500;
  if (rank <=  70) return 400;
  if (rank <=  80) return 300;
  if (rank <=  90) return 200;
  if (rank <= 100) return 100;
  return 0;
}

async function distributeRaidPoints(eventId: number): Promise<void> {
  const participants = await query<{ character_id: number; class_rank: string; class_name: string }>(
    `SELECT p.character_id, c.class_name,
            ROW_NUMBER() OVER (PARTITION BY c.class_name ORDER BY p.total_damage DESC)::text AS class_rank
       FROM world_event_participants p
       JOIN characters c ON c.id = p.character_id
      WHERE p.event_id = $1`,
    [eventId]
  );
  for (const row of participants.rows) {
    const rank = Number(row.class_rank);
    const pts = pointsForClassRank(rank);
    if (pts > 0) {
      try {
        await query(
          'UPDATE characters SET raid_points = COALESCE(raid_points, 0) + $1 WHERE id = $2',
          [pts, row.character_id]
        );
      } catch (e) { console.error('[raid] points UPDATE fail', row.character_id, e); }
    }
  }
}

// 정수 분배 — 두 라인 독립 굴림, 중복 가능. (2026-05-18 직업별 순위 기준 개편)
//  라인 A: 모든 참여자 25% 확률 (변경 없음)
//  라인 B: 클래스 내 1~10위 100% · 11~20위 90% · 21~30위 80% · 31~40위 70% · 41~50위 60%
//          51~60위 50% · 61~70위 40% · 71~80위 30% · 81~90위 20% · 91~100위 10% · 그 외 0
function lineBChanceForClassRank(rank: number): number {
  if (rank <=  10) return 1.00;
  if (rank <=  20) return 0.90;
  if (rank <=  30) return 0.80;
  if (rank <=  40) return 0.70;
  if (rank <=  50) return 0.60;
  if (rank <=  60) return 0.50;
  if (rank <=  70) return 0.40;
  if (rank <=  80) return 0.30;
  if (rank <=  90) return 0.20;
  if (rank <= 100) return 0.10;
  return 0;
}

async function distributeEssence(eventId: number, essenceName: string, bossName: string): Promise<void> {
  const essR = await query<{ id: number }>(
    `SELECT id FROM items WHERE name = $1 LIMIT 1`, [essenceName]
  );
  if (essR.rowCount === 0) {
    console.warn(`[raid] essence item not found: ${essenceName}`);
    return;
  }
  const essenceItemId = essR.rows[0].id;
  const participants = await query<{ character_id: number; total_damage: string; class_rank: string; class_name: string }>(
    `SELECT p.character_id, p.total_damage::text AS total_damage, c.class_name,
            ROW_NUMBER() OVER (PARTITION BY c.class_name ORDER BY p.total_damage DESC)::text AS class_rank
       FROM world_event_participants p
       JOIN characters c ON c.id = p.character_id
      WHERE p.event_id = $1`,
    [eventId]
  );
  for (const p of participants.rows) {
    let gained = 0;
    const rolls: string[] = [];
    // 라인 A — 모든 참여자 25%
    if (Math.random() < 0.25) { gained++; rolls.push('A(25%)'); }
    // 라인 B — 클래스 내 순위 기반
    const rank = Number(p.class_rank);
    const bChance = lineBChanceForClassRank(rank);
    if (bChance > 0 && Math.random() < bChance) {
      gained++;
      rolls.push(`B(${Math.round(bChance * 100)}%·${p.class_name} ${rank}위)`);
    }
    if (gained > 0) {
      try {
        const { overflow } = await addItemToInventory(p.character_id, essenceItemId, gained);
        if (overflow > 0) {
          await deliverToMailbox(
            p.character_id,
            `${bossName} 정수`,
            `${p.class_name} ${rank}위 보상 — ${rolls.join(', ')}\n인벤토리 가득 → 우편 발송 ${overflow}개`,
            essenceItemId, overflow,
          );
        }
      } catch (e) { console.error('[raid] essence give fail', p.character_id, e); }
    }
  }
}

// ─── 스케줄러 ───
export async function checkAndSpawnWorldEvent(io?: Server) {
  const active = await getActiveEvent(); if (active) return;
  const now = new Date();
  const hour = now.getUTCHours();
  const kstDay = new Date(now.getTime() + 9 * 3600000).getDay(); // 0=일 1=월 2=화 3=수 4=목 5=금 6=토

  // 같은 시간대에 등록된 모든 보스 후보
  const schedRows = await query<{ boss_id: number }>(
    `SELECT boss_id FROM world_event_schedule WHERE hour_utc = $1 AND enabled = TRUE`, [hour]
  );
  if (schedRows.rowCount === 0) return;

  // raid-bosses-v2 — 발라카스 단일 보스, 매일 KST 17:00 (UTC 08:00) 1회 spawn.
  // 9시간 진행 (time_limit_sec = 32400) → KST 02:00 만료 결산.
  // 아트라스(2)/카르나스(3) 는 보류 — DB 정의는 유지하지만 spawn 안 함.
  void kstDay; // 요일 미사용 (단일 보스, 매일 동일)
  let chosenBossId: number | null = null;
  if (hour === 8) {
    chosenBossId = 1; // 발라카스
    if (!schedRows.rows.some(r => r.boss_id === 1)) chosenBossId = null;
  }
  if (!chosenBossId) return;

  const recent = await query(`SELECT id FROM world_event_active WHERE started_at > NOW() - INTERVAL '1 hour'`);
  if ((recent.rowCount ?? 0) > 0) return;
  const bossR = await query<{ name: string; max_hp: number; time_limit_sec: number }>(
    `SELECT name, max_hp, time_limit_sec FROM world_event_bosses WHERE id = $1`, [chosenBossId]
  );
  if (bossR.rowCount === 0) return;
  const boss = bossR.rows[0];
  await query(`INSERT INTO world_event_active (boss_id, current_hp, max_hp, ends_at) VALUES ($1, $2, $2, NOW() + INTERVAL '1 second' * $3)`, [chosenBossId, boss.max_hp, boss.time_limit_sec]);
  if (io) io.emit('world_event', { type: 'world_event_start', bossName: boss.name, endsAt: new Date(Date.now() + boss.time_limit_sec * 1000).toISOString() });
}

export async function checkExpiredWorldEvents(io?: Server) {
  const expired = await query<{ id: number }>(`SELECT id FROM world_event_active WHERE status = 'active' AND ends_at < NOW()`);
  for (const row of expired.rows) await finishEvent(row.id, 'expired', io);
  const defeated = await query<{ id: number }>(`SELECT id FROM world_event_active WHERE status = 'active' AND current_hp <= 0`);
  for (const row of defeated.rows) await finishEvent(row.id, 'defeated', io);
}
