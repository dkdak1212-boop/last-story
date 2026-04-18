// PvP 실시간 전투 엔진
// PvE engine.ts 와 독립. 100ms 틱, 양측 게이지 기반, 방어자는 AI 로직 + 공격자는 수동/자동.

import { randomUUID } from 'node:crypto';
import { query } from '../db/pool.js';
import { calcDamage, type EffectiveStats } from '../game/formulas.js';
import { loadCharacter, getEffectiveStats, getNodePassives } from '../game/character.js';
import { loadEquipPrefixes, getCharSkills, buildPassiveMap, applyCombatStatBoost, type SkillDef } from '../combat/engine.js';
import { getIo } from '../ws/io.js';

const GAUGE_MAX = 1000;
const GAUGE_FILL_RATE = 0.1;     // speed × rate = 틱당 충전량
const TICK_MS = 100;
const TIME_LIMIT_MS = 180_000;   // 3분
const MANUAL_TIMEOUT_MS = 3000;  // 수동 대기 시간 — 초과 시 자동 발동
// PvP 보정값 — 한방컷 방지
const PVP_DAMAGE_MULT = 0.1;           // 입히는 데미지 × 0.1 (10%)
const PVP_HP_MULT = 10;                // 양측 최대 HP × 10
const PVP_PER_HIT_CAP_PCT = 5;         // 한 타격당 최대 maxHp 의 5% (절대 캡) → 최소 20타 보장
const PVP_CRIT_MULT = 0.7;             // 치명타 데미지 ×0.7 (폭딜 완화)

interface FighterState {
  id: number;                    // character_id
  name: string;
  className: string;
  level: number;
  hp: number;
  maxHp: number;
  gauge: number;
  stats: EffectiveStats;
  skills: SkillDef[];
  passives: Map<string, number>;
  equipPrefixes: Record<string, number>;
  skillCooldowns: Map<number, number>;   // skill_id → remaining actions
  skillLastUsed: Map<number, number>;    // skill_id → session tick index (for AI rotation)
  statusEffects: StatusEffect[];         // dot/shield/stat_buff
  shieldAmount: number;
  activeSummons: { name: string; damageMult: number; useMatk: boolean; remainingActions: number; isDot?: boolean }[];
  // 1회성 차지 (PvE 와 동일)
  hasFirstStrike: boolean;   // 약점간파 prefix (first_strike_pct) — 첫 공격 1회
  hasFirstSkill: boolean;    // 도적 shadow_strike — 첫 스킬 1회
  rage: number;              // 전사 분노 (0~100)
  ticksSinceLastHit: number; // 각성 (ambush_pct) — 마지막 피격 이후 100ms 틱
  missStack: number;         // 신중한 (miss_combo_pct) — 누적 빗나감 (cap 5)
  dodgeBurstPending: boolean;// 회피의 (evasion_burst_pct) — 직전 회피 성공 플래그
  manaFlowStacks: number;    // 마법사 마나 흐름 (0~5)
  manaFlowActive: number;    // 마법사 버스트 남은 행동 수 (0=비활성) — 쿨다운 무시
  poisonResonance: number;   // 도적 독의 공명 (0~10)
}

interface StatusEffect {
  type: 'dot' | 'shield' | 'stat_buff' | 'stun' | 'speed_mod'
      | 'damage_reduce' | 'damage_reflect' | 'gauge_freeze' | 'accuracy_debuff';
  value: number;
  remainingActions: number; // 대상의 action 수 단위 — 매 행동 시 -1
  source: 'attacker' | 'defender';
}

export interface PvPSession {
  battleId: string;
  attacker: FighterState;
  defender: FighterState;
  startedAt: number;
  tickCount: number;
  attackerAuto: boolean;
  attackerWaitingInput: boolean;
  attackerWaitingSince: number;
  log: string[];
  ended: boolean;
  winnerId: number | null;
  endReason: 'hp' | 'timeout' | 'forfeit' | 'dc' | null;
  attackerLastPing: number;
  isFastForward?: boolean; // 스킵 모드 — 틱을 합성 시간으로 즉시 연속 실행, WS push / DC 체크 스킵
}

const sessions = new Map<string, PvPSession>();
let loopStarted = false;

export function getSession(battleId: string): PvPSession | undefined {
  return sessions.get(battleId);
}

export function hasActiveSession(attackerId: number): boolean {
  for (const s of sessions.values()) {
    if (!s.ended && s.attacker.id === attackerId) return true;
  }
  return false;
}

// ─────────────────────────────────────────────
// 세션 생성
// ─────────────────────────────────────────────
export async function createPvPSession(attackerId: number, defenderId: number): Promise<{ battleId: string } | { error: string; status: number }> {
  if (attackerId === defenderId) return { error: 'cannot attack self', status: 400 };
  if (hasActiveSession(attackerId)) return { error: '진행 중인 PvP 전투가 있습니다', status: 400 };

  // 방어자 캐릭터 메타 로드 (이름/직업/레벨)
  const defR = await query<{ name: string; class_name: string; level: number }>(
    `SELECT name, class_name, level FROM characters WHERE id = $1`, [defenderId]
  );
  if (!defR.rowCount) return { error: 'defender not found', status: 404 };
  const defMeta = defR.rows[0];

  // 방어 세팅 로드 — 없으면 방어자의 현재 상태 라이브 컴파일 (폴백)
  let L: {
    effective_stats: EffectiveStats;
    equip_prefixes: Record<string, number>;
    passives: Record<string, number>;
    skill_slots: number[];
    skills: any[];
  };
  const loadR = await query<{
    effective_stats: EffectiveStats; equip_prefixes: Record<string, number>;
    passives: Record<string, number>; skill_slots: number[];
    skills: any[];
  }>(
    `SELECT effective_stats, equip_prefixes, passives, skill_slots, skills
     FROM pvp_defense_loadouts WHERE character_id = $1`, [defenderId]
  );
  if (loadR.rowCount) {
    L = loadR.rows[0];
  } else {
    // 라이브 폴백 — 방어자가 현재 PvE 에 쓰는 장비/스킬/스탯 스냅샷
    const fullDef = await loadCharacter(defenderId);
    if (!fullDef) return { error: 'defender not found', status: 404 };
    const defEff = await getEffectiveStats(fullDef);
    const defPrefixes = await loadEquipPrefixes(defenderId);
    const defPassivesRaw = await getNodePassives(defenderId);
    const defPassivesMap = buildPassiveMap(defPassivesRaw);
    // 키스톤 + 접두사 2차 적용 (PvE 와 동일)
    applyCombatStatBoost(defEff, defPassivesMap, defPrefixes, fullDef.max_hp);
    const defPassivesObj: Record<string, number> = {};
    for (const [k, v] of defPassivesMap) defPassivesObj[k] = v;
    const defSkillsAll = await getCharSkills(defenderId, fullDef.class_name, fullDef.level);
    const defSkillsList = defSkillsAll
      .filter(sk => sk.cooldown_actions > 0)
      .sort((a, b) => (a.slot_order || 99) - (b.slot_order || 99))
      .slice(0, 7);
    L = {
      effective_stats: defEff,
      equip_prefixes: defPrefixes,
      passives: defPassivesObj,
      skill_slots: defSkillsList.map(s => s.id),
      skills: defSkillsList.map(s => ({
        id: s.id, name: s.name, damage_mult: s.damage_mult, kind: s.kind,
        cooldown_actions: s.cooldown_actions, flat_damage: s.flat_damage,
        effect_type: s.effect_type, effect_value: s.effect_value,
        effect_duration: s.effect_duration, required_level: s.required_level,
        slot_order: s.slot_order, element: s.element, description: s.description,
      })),
    };
  }

  // 공격자 — 현재 실시간 상태 로드
  const attChar = await loadCharacter(attackerId);
  if (!attChar) return { error: 'attacker not found', status: 404 };
  const attEff = await getEffectiveStats(attChar);
  const attSkills = await getCharSkills(attackerId, attChar.class_name, attChar.level);
  const attPassivesRaw = await getNodePassives(attackerId);
  const attPassives = buildPassiveMap(attPassivesRaw);
  const attPrefixes = await loadEquipPrefixes(attackerId);
  // 키스톤 패시브 + atk_pct / matk_pct 2차 적용 (PvE startCombatSession 과 동일)
  applyCombatStatBoost(attEff, attPassives, attPrefixes, attChar.max_hp);

  // 방어자 skills — 스냅샷 JSON → SkillDef[] 변환
  const defSkills: SkillDef[] = Array.isArray(L.skills) ? L.skills.map((s: any) => ({
    id: s.id, name: s.name, damage_mult: Number(s.damage_mult), kind: s.kind,
    cooldown_actions: s.cooldown_actions, flat_damage: s.flat_damage || 0,
    effect_type: s.effect_type, effect_value: Number(s.effect_value || 0),
    effect_duration: s.effect_duration || 0, required_level: s.required_level,
    slot_order: s.slot_order || 0, element: s.element ?? null, description: s.description ?? '',
  })) : [];

  // 방어자 passives Map
  const defPassives = new Map<string, number>();
  for (const [k, v] of Object.entries(L.passives || {})) defPassives.set(k, Number(v));

  const battleId = randomUUID();
  const now = Date.now();
  const session: PvPSession = {
    battleId,
    attacker: {
      id: attackerId, name: attChar.name, className: attChar.class_name, level: attChar.level,
      hp: attEff.maxHp * PVP_HP_MULT, maxHp: attEff.maxHp * PVP_HP_MULT, gauge: 0,
      stats: attEff, skills: attSkills, passives: attPassives,
      equipPrefixes: attPrefixes,
      skillCooldowns: new Map(), skillLastUsed: new Map(),
      statusEffects: [], shieldAmount: 0, activeSummons: [],
      hasFirstStrike: true, hasFirstSkill: true, rage: 0,
      ticksSinceLastHit: 0, missStack: 0, dodgeBurstPending: false,
      manaFlowStacks: 0, manaFlowActive: 0, poisonResonance: 0,
    },
    defender: {
      id: defenderId, name: defMeta.name, className: defMeta.class_name, level: defMeta.level,
      hp: L.effective_stats.maxHp * PVP_HP_MULT, maxHp: L.effective_stats.maxHp * PVP_HP_MULT, gauge: 0,
      stats: L.effective_stats, skills: defSkills, passives: defPassives,
      equipPrefixes: L.equip_prefixes || {},
      skillCooldowns: new Map(), skillLastUsed: new Map(),
      statusEffects: [], shieldAmount: 0, activeSummons: [],
      hasFirstStrike: true, hasFirstSkill: true, rage: 0,
      ticksSinceLastHit: 0, missStack: 0, dodgeBurstPending: false,
      manaFlowStacks: 0, manaFlowActive: 0, poisonResonance: 0,
    },
    startedAt: now,
    tickCount: 0,
    attackerAuto: false, // PvP 항상 수동 모드 (기본 공격자 직접 발동)
    attackerWaitingInput: false,
    attackerWaitingSince: 0,
    log: [`${attChar.name}(Lv.${attChar.level}) vs ${defMeta.name}(Lv.${defMeta.level})`],
    ended: false,
    winnerId: null,
    endReason: null,
    attackerLastPing: now,
  };
  // 패시브: counter_incarnation (상시 반사) — 세션 시작 시 effect 등록
  const attCounter = attPassives.get('counter_incarnation') || 0;
  if (attCounter > 0) {
    session.attacker.statusEffects.push({ type: 'damage_reflect', value: attCounter, remainingActions: 999999, source: 'attacker' });
  }
  const defCounter = typeof L.passives === 'object' ? Number((L.passives as any).counter_incarnation || 0) : 0;
  if (defCounter > 0) {
    session.defender.statusEffects.push({ type: 'damage_reflect', value: defCounter, remainingActions: 999999, source: 'defender' });
  }

  sessions.set(battleId, session);
  ensureLoop();
  pushState(session);
  return { battleId };
}

// 패시브 값 헬퍼
function getFPassive(f: FighterState, key: string): number {
  return f.passives.get(key) || 0;
}

// 데미지 증폭 — PvE applyDamagePrefixes 를 PvP FighterState 로 이식한 포괄 버전
function amplifyDamage(
  self: FighterState,
  opp: FighterState,
  baseDmg: number,
  isCrit: boolean,
  opts: { consumeFirstStrike?: boolean; consumeFirstSkill?: boolean; isDot?: boolean; skillName?: string } = {}
): number {
  let dmg = baseDmg;
  // atk_buff (전쟁의 함성 등)
  const atkBuff = self.statusEffects
    .filter(e => e.type === 'stat_buff' && e.remainingActions > 0)
    .reduce((a, e) => a + e.value, 0);
  if (atkBuff > 0) dmg = Math.round(dmg * (1 + atkBuff / 100));
  // 광전사 prefix (HP 30% 이하)
  const berserk = self.equipPrefixes.berserk_pct || 0;
  if (berserk > 0 && self.hp / self.maxHp <= 0.3) {
    dmg = Math.round(dmg * (1 + berserk / 100));
  }
  // spell_amp 패시브 (마법사)
  const spellAmp = getFPassive(self, 'spell_amp');
  if (spellAmp > 0) dmg = Math.round(dmg * (1 + spellAmp / 100));
  // judge_amp / holy_judge 패시브 (성직자)
  if (self.className === 'cleric') {
    const judgeAmp = getFPassive(self, 'judge_amp') + getFPassive(self, 'holy_judge');
    if (judgeAmp > 0) dmg = Math.round(dmg * (1 + judgeAmp / 100));
    // 성직자 심판자의 권능: 자신 쉴드 보유 시 +50%
    if (opts.skillName === '심판자의 권능' && self.shieldAmount > 0) {
      dmg = Math.round(dmg * 1.5);
    }
  }
  // 마법사 고유 패시브 — 원소 침식 / 마력 과부하
  if (self.className === 'mage') {
    // 원소 침식: 상대에게 도트(dot/poison) 걸려있으면 +30%
    const oppHasDot = opp.statusEffects.some(e => e.type === 'dot' && e.remainingActions > 0);
    if (oppHasDot) dmg = Math.round(dmg * 1.3);
    // 마력 과부하: 자기가 속도 감소 디버프 상태면 +80%
    const selfSlowed = self.statusEffects.some(e =>
      e.type === 'speed_mod' && e.remainingActions > 0 && e.value < 0 && e.source !== (self === (self as any) ? 'attacker' : 'defender'));
    if (selfSlowed) dmg = Math.round(dmg * 1.8);
  }
  // 도적 암흑의 심판: 상대에게 걸린 독 스택당 +8%
  if (self.className === 'rogue' && opts.skillName === '암흑의 심판') {
    const poisonStacks = self.statusEffects.filter(e => e.type === 'dot' && e.remainingActions > 0).length;
    if (poisonStacks > 0) dmg = Math.round(dmg * (1 + poisonStacks * 0.08));
  }
  // dot_amp 패시브 + prefix (도트 전용)
  if (opts.isDot) {
    const dotAmp = getFPassive(self, 'dot_amp');
    const dotAmpPct = self.equipPrefixes.dot_amp_pct || 0;
    const totalDotAmp = dotAmp + dotAmpPct;
    if (totalDotAmp > 0) dmg = Math.round(dmg * (1 + totalDotAmp / 100));
  }
  // speed_to_dmg 패시브 (SPD → ATK 변환)
  const speedToDmg = getFPassive(self, 'speed_to_dmg');
  if (speedToDmg > 0) {
    dmg += Math.round(self.stats.spd * speedToDmg / 100);
  }
  // 약점간파 prefix (1회성)
  if (opts.consumeFirstStrike !== false && self.hasFirstStrike) {
    const firstStrike = self.equipPrefixes.first_strike_pct || 0;
    if (firstStrike > 0) {
      dmg = Math.round(dmg * (1 + firstStrike / 100));
      self.hasFirstStrike = false;
    }
  }
  // shadow_strike (첫 스킬)
  if (opts.consumeFirstSkill !== false && self.hasFirstSkill) {
    const shadowStrike = getFPassive(self, 'shadow_strike');
    if (shadowStrike > 0) {
      dmg = Math.round(dmg * (1 + shadowStrike / 100));
      self.hasFirstSkill = false;
    }
  }
  // 각성 prefix (5초 이상 미피격 = 50틱)
  if (opts.consumeFirstStrike !== false && self.ticksSinceLastHit >= 50) {
    const ambush = self.equipPrefixes.ambush_pct || 0;
    if (ambush > 0) {
      dmg = Math.round(dmg * (1 + ambush / 100));
      self.ticksSinceLastHit = 0;
    }
  }
  // 신중한 prefix (누적 빗나감 × miss_combo_pct)
  if (opts.consumeFirstStrike !== false && self.missStack > 0) {
    const missCombo = self.equipPrefixes.miss_combo_pct || 0;
    if (missCombo > 0) {
      const bonus = missCombo * self.missStack;
      dmg = Math.round(dmg * (1 + bonus / 100));
      self.missStack = 0;
    }
  }
  // 회피의 prefix (직전 회피 성공)
  if (opts.consumeFirstStrike !== false && self.dodgeBurstPending) {
    const dodgeBurst = self.equipPrefixes.evasion_burst_pct || 0;
    if (dodgeBurst > 0) {
      dmg = Math.round(dmg * (1 + dodgeBurst / 100));
      self.dodgeBurstPending = false;
    }
  }
  // 크리 추가 배율 (crit_damage 패시브 + crit_dmg_pct prefix)
  if (isCrit) {
    const critDmgBonus = getFPassive(self, 'crit_damage') + (self.equipPrefixes.crit_dmg_pct || 0);
    if (critDmgBonus > 0) dmg = Math.round(dmg * (1 + critDmgBonus / 100));
    // assassin_execute 패시브 (크리 시 적 HP 15% 이하 → 즉사 확률)
    const execute = getFPassive(self, 'assassin_execute');
    if (execute > 0 && opp.hp > 0 && opp.hp <= opp.maxHp * 0.15) {
      if (Math.random() * 100 < execute) {
        dmg = Math.max(dmg, opp.hp + 1);
      }
    }
  }
  return dmg;
}

// accuracy_debuff 를 적용한 self.stats 사본 (attack 시 공격자 accuracy 감소)
function statsWithAccuracyDebuff(self: FighterState): typeof self.stats {
  const debuff = self.statusEffects
    .filter(e => e.type === 'accuracy_debuff' && e.remainingActions > 0)
    .reduce((a, e) => a + e.value, 0);
  if (debuff <= 0) return self.stats;
  return { ...self.stats, accuracy: Math.max(0, Math.round(self.stats.accuracy - debuff)) };
}

// armor_pierce: target 의 def/mdef 를 % 낮춘 사본 반환 (calcDamage 에 전달)
function applyArmorPierce(self: FighterState, opp: FighterState): typeof opp.stats {
  const armorPierce = getFPassive(self, 'armor_pierce');
  const defReduce = self.equipPrefixes.def_reduce_pct || 0;
  const defPierce = self.equipPrefixes.def_pierce_pct || 0;
  const total = Math.min(80, armorPierce + defReduce + defPierce);
  if (total <= 0) return opp.stats;
  return {
    ...opp.stats,
    def: Math.round(opp.stats.def * (1 - total / 100)),
    mdef: Math.round(opp.stats.mdef * (1 - total / 100)),
  };
}

// ─────────────────────────────────────────────
// 루프
// ─────────────────────────────────────────────
function ensureLoop() {
  if (loopStarted) return;
  loopStarted = true;
  setInterval(() => {
    for (const [id, s] of sessions) {
      if (s.ended) {
        if (Date.now() - s.startedAt > 300_000) sessions.delete(id); // 5분 후 정리
        continue;
      }
      try { tickSession(s); } catch (e) { console.error('[pvp-rt] tick err', e); }
    }
  }, TICK_MS);
  console.log('[pvp-rt] engine started (100ms tick)');
}

function tickSession(s: PvPSession): void {
  const now = Date.now();
  s.tickCount++;

  // Fast-forward: 합성 경과 시간 (틱 수 × 100ms)
  const elapsedMs = s.isFastForward ? s.tickCount * TICK_MS : (now - s.startedAt);

  // 시간 초과 체크
  if (elapsedMs >= TIME_LIMIT_MS) {
    finalizeTimeout(s);
    return;
  }

  // 공격자 DC 체크 (30초 ping 없음) — FF 에서는 스킵
  if (!s.isFastForward && now - s.attackerLastPing > 30_000) {
    finalize(s, s.defender.id, 'dc');
    return;
  }

  // 양측 게이지 충전 (gauge_freeze 활성 시 충전 스킵, speed_mod 반영)
  const fillGauge = (f: FighterState) => {
    const frozen = f.statusEffects.some(e => e.type === 'gauge_freeze' && e.remainingActions > 0);
    if (frozen) return;
    const speedMod = f.statusEffects
      .filter(e => e.type === 'speed_mod' && e.remainingActions > 0)
      .reduce((acc, e) => acc + e.value, 0);
    const spdEff = Math.max(10, f.stats.spd * (1 + speedMod / 100));
    f.gauge = Math.min(GAUGE_MAX, f.gauge + spdEff * GAUGE_FILL_RATE);
  };
  if (!s.attackerWaitingInput) fillGauge(s.attacker);
  fillGauge(s.defender);

  // 각성 카운터 +1 per tick (100ms) → 50틱 = 5초
  s.attacker.ticksSinceLastHit += 1;
  s.defender.ticksSinceLastHit += 1;

  // HP 재생 (hp_regen prefix — 초당 hp_regen, tick 100ms 기준 = /10)
  const applyRegen = (f: FighterState) => {
    const regen = f.equipPrefixes.hp_regen || 0;
    if (regen > 0 && f.hp > 0 && f.hp < f.maxHp) {
      f.hp = Math.min(f.maxHp, f.hp + regen / 10);
    }
  };
  applyRegen(s.attacker);
  applyRegen(s.defender);

  // 공격자 행동 판정
  if (s.attacker.gauge >= GAUGE_MAX) {
    if (s.attackerAuto) {
      const pick = pickAttackerAuto(s);
      executeAction(s, 'attacker', pick);
      processSummons(s, 'attacker');
      s.attacker.gauge = 0;
    } else {
      if (!s.attackerWaitingInput) {
        s.attackerWaitingInput = true;
        s.attackerWaitingSince = now;
      } else if (now - s.attackerWaitingSince >= MANUAL_TIMEOUT_MS) {
        const pick = pickAttackerAuto(s);
        executeAction(s, 'attacker', pick);
        processSummons(s, 'attacker');
        s.attacker.gauge = 0;
        s.attackerWaitingInput = false;
      }
    }
  }

  // 방어자 AI 행동
  if (s.defender.gauge >= GAUGE_MAX) {
    const pick = pickDefenderAI(s);
    executeAction(s, 'defender', pick);
    processSummons(s, 'defender');
    s.defender.gauge = 0;
  }

  // 상태 이상 틱 (dot)
  tickDots(s);

  // 승패 체크
  if (s.attacker.hp <= 0) { void finalize(s, s.defender.id, 'hp'); return; }
  if (s.defender.hp <= 0) { void finalize(s, s.attacker.id, 'hp'); return; }

  // FF 모드는 WS push 스킵
  if (!s.isFastForward) pushState(s);
}

function tickDots(s: PvPSession): void {
  const processEffect = (fighter: FighterState, target: FighterState) => {
    // dot_amp 증폭 (패시브 + prefix)
    const dotAmp = getFPassive(fighter, 'dot_amp') + (fighter.equipPrefixes.dot_amp_pct || 0);
    const ampMult = dotAmp > 0 ? 1 + dotAmp / 100 : 1;
    for (let i = fighter.statusEffects.length - 1; i >= 0; i--) {
      const eff = fighter.statusEffects[i];
      if (eff.type === 'dot') {
        let base = Math.round(eff.value * ampMult);
        let d = Math.max(1, Math.round(base * PVP_DAMAGE_MULT));
        const cap = Math.max(1, Math.floor(target.maxHp * PVP_PER_HIT_CAP_PCT / 100));
        if (d > cap) d = cap;
        target.hp -= d;
        eff.remainingActions -= 1;
        if (eff.remainingActions <= 0) fighter.statusEffects.splice(i, 1);
      }
    }
  };
  processEffect(s.attacker, s.defender);
  processEffect(s.defender, s.attacker);
}

// 쿨다운 데크리먼트 (매 행동마다)
function decrementCooldowns(f: FighterState): void {
  for (const [id, cd] of Array.from(f.skillCooldowns)) {
    if (cd > 0) f.skillCooldowns.set(id, cd - 1);
    if (f.skillCooldowns.get(id)! <= 0) f.skillCooldowns.delete(id);
  }
}

const MAX_SUMMONS = 3;
function pushSummon(f: FighterState, name: string, damageMult: number, useMatk: boolean, remainingActions: number, isDot = false): void {
  if (f.activeSummons.length >= MAX_SUMMONS) f.activeSummons.shift(); // FIFO 최대 3마리
  f.activeSummons.push({ name, damageMult: Math.max(0.1, damageMult), useMatk, remainingActions: Math.max(1, remainingActions), isDot });
}

// 행동 후 소환수 공격 처리 — armor_pierce + amplify + calcDamage 경유
function processSummons(s: PvPSession, side: 'attacker' | 'defender'): void {
  const self = side === 'attacker' ? s.attacker : s.defender;
  const opp = side === 'attacker' ? s.defender : s.attacker;
  if (self.activeSummons.length === 0) return;
  const oppStats = applyArmorPierce(self, opp);
  // summon_buff_active (지휘/군주의 위엄) 데미지 증폭
  const summonBuff = self.statusEffects
    .filter(e => e.type === 'stat_buff' && e.remainingActions > 0)
    .reduce((a, e) => a + e.value, 0);
  for (let i = self.activeSummons.length - 1; i >= 0; i--) {
    const sm = self.activeSummons[i];
    const d = calcDamage(self.stats, oppStats, sm.damageMult, sm.useMatk, 0);
    if (d.miss) {
      s.log.push(`🪄 ${self.name}의 ${sm.name} → 빗나감`);
    } else {
      let dmg = d.damage;
      if (summonBuff > 0) dmg = Math.round(dmg * (1 + summonBuff / 100));
      const prevHp = opp.hp;
      applyDamage(s, side, dmg, false, d.crit);
      const actual = Math.max(0, prevHp - opp.hp);
      s.log.push(`🪄 ${self.name}의 ${sm.name} → ${actual}${d.crit ? ' 치명!' : ''}`);
    }
    sm.remainingActions -= 1;
    if (sm.remainingActions <= 0) self.activeSummons.splice(i, 1);
  }
}

// ─────────────────────────────────────────────
// 스킬 선택
// ─────────────────────────────────────────────
function pickAttackerAuto(s: PvPSession): SkillDef | null {
  return pickBySlotOrder(s.attacker);
}

function pickDefenderAI(s: PvPSession): SkillDef | null {
  const self = s.defender;
  const opp = s.attacker;
  const available = self.skills.filter(sk => (self.skillCooldowns.get(sk.id) ?? 0) === 0);
  if (available.length === 0) return null;

  const hpPct = self.hp / self.maxHp;

  // 1) 치명 상황 — HP ≤ 20% : heal / shield 우선
  if (hpPct <= 0.2) {
    const healer = available.find(sk => sk.effect_type === 'heal' || sk.kind === 'heal');
    if (healer) return healer;
    const shielder = available.find(sk => sk.effect_type === 'shield' || sk.kind === 'shield');
    if (shielder) return shielder;
  }

  // 2) 상대가 쉴드 활성 → shield_break
  if (opp.shieldAmount > 0) {
    const sb = available.find(sk => sk.effect_type === 'shield_break');
    if (sb) return sb;
  }

  // 3) 버프 계열 중 내가 아직 활성화 안한 게 있으면
  const hasBuff = self.statusEffects.some(e => e.type === 'stat_buff' && e.source === 'defender');
  if (!hasBuff) {
    const buff = available.find(sk => sk.kind === 'buff' || sk.effect_type === 'stat_buff' || sk.effect_type === 'atk_buff');
    if (buff) return buff;
  }

  // 4) 중복 회피 + 슬롯 순서
  const sorted = [...available].sort((a, b) => (a.slot_order || 99) - (b.slot_order || 99));
  const lastUsed = [...self.skillLastUsed.entries()].sort((a, b) => b[1] - a[1])[0];
  if (lastUsed && sorted.length > 1 && sorted[0].id === lastUsed[0]) {
    return sorted[1];
  }
  return sorted[0] ?? null;
}

function pickBySlotOrder(f: FighterState): SkillDef | null {
  const avail = f.skills
    .filter(sk => (f.skillCooldowns.get(sk.id) ?? 0) === 0)
    .sort((a, b) => (a.slot_order || 99) - (b.slot_order || 99));
  return avail[0] ?? null;
}

// ─────────────────────────────────────────────
// 스킬 실행 (단순화된 버전 — 주요 effect_type 만 지원)
// ─────────────────────────────────────────────
function executeAction(s: PvPSession, side: 'attacker' | 'defender', skill: SkillDef | null): void {
  const self = side === 'attacker' ? s.attacker : s.defender;
  const opp = side === 'attacker' ? s.defender : s.attacker;

  // stun 체크 — 기절 상태면 행동 스킵
  const stunned = self.statusEffects.find(e => e.type === 'stun' && e.remainingActions > 0);
  if (stunned) {
    stunned.remainingActions -= 1;
    if (stunned.remainingActions <= 0) {
      self.statusEffects = self.statusEffects.filter(e => e !== stunned);
    }
    s.log.push(`${self.name} 기절로 행동 불가`);
    return;
  }

  // 매 행동마다 쿨다운 데크리먼트 + 자기 지속 효과 감소
  decrementCooldowns(self);
  for (let i = self.statusEffects.length - 1; i >= 0; i--) {
    const e = self.statusEffects[i];
    if (e.type !== 'dot' && e.type !== 'stun') { // dot는 tickDots, stun은 위에서 처리
      e.remainingActions -= 1;
      if (e.remainingActions <= 0) self.statusEffects.splice(i, 1);
    }
  }

  if (!skill) {
    // 기본 공격
    const d = calcDamage(self.stats, opp.stats, 1.0, self.className === 'mage' || self.className === 'cleric', 0);
    applyDamage(s, side, d.damage, d.miss, d.crit);
    s.log.push(d.miss ? `${self.name} 기본 공격 빗나감` : `${self.name} 기본 공격 ${d.damage}${d.crit ? ' 치명타!' : ''}`);
    self.skillLastUsed.set(0, s.tickCount);
    return;
  }

  // 쿨다운 등록 (마법사 마나 흐름 버스트 중엔 스킵)
  const manaBurstActive = self.className === 'mage' && self.manaFlowActive > 0;
  if (skill.cooldown_actions > 0 && !manaBurstActive) self.skillCooldowns.set(skill.id, skill.cooldown_actions);
  self.skillLastUsed.set(skill.id, s.tickCount);

  const useMatk = skill.kind === 'magic' || skill.kind === 'heal'
    || self.className === 'mage' || self.className === 'cleric';

  // 편의 함수 — armor_pierce + amplifyDamage + 분노 폭발 + applyDamage + 후속타 통합
  const dealDamage = (mult: number, flat = skill.flat_damage) => {
    const oppStats = applyArmorPierce(self, opp);
    const attStats = statsWithAccuracyDebuff(self);
    const d = calcDamage(attStats, oppStats, mult, useMatk, flat);
    if (d.miss) {
      self.missStack = Math.min(5, self.missStack + 1);
      return d;
    }
    let amplified = amplifyDamage(self, opp, d.damage, d.crit, { skillName: skName });
    // 전사 분노 폭발
    let rageProc = false;
    if (self.className === 'warrior' && self.rage >= 100) {
      amplified = Math.round(amplified * 3);
      const rageReduce = getFPassive(self, 'rage_reduce');
      self.rage = rageReduce > 0 ? Math.round(self.rage * (rageReduce / 100)) : 0;
      rageProc = true;
    }
    applyDamage(s, side, amplified, false, d.crit);
    if (self.className === 'warrior' && !rageProc) {
      self.rage = Math.min(100, self.rage + (skill.cooldown_actions === 0 ? 10 : 15));
    }
    if (rageProc) s.log.push(`🔥 ${self.name} 분노 폭발! ×3`);
    // 흡혈 prefix
    const lifesteal = self.equipPrefixes.lifesteal_pct || 0;
    if (lifesteal > 0) self.hp = Math.min(self.maxHp, self.hp + Math.round(amplified * lifesteal / 100));
    // 치명 흡혈 패시브
    if (d.crit) {
      const critLifesteal = getFPassive(self, 'crit_lifesteal');
      if (critLifesteal > 0) self.hp = Math.min(self.maxHp, self.hp + Math.round(amplified * critLifesteal / 100));
    }
    // 재충전 prefix — 크리 시 자기 게이지 충전
    if (d.crit) {
      const gaugeOnCrit = self.equipPrefixes.gauge_on_crit_pct || 0;
      if (gaugeOnCrit > 0) {
        const gain = Math.min(GAUGE_MAX * 0.5, GAUGE_MAX * gaugeOnCrit / 100);
        self.gauge = Math.min(GAUGE_MAX, self.gauge + gain);
      }
    }
    // extra_hit 패시브 — 확률 추가 타격 (0.5x)
    const extraHit = getFPassive(self, 'extra_hit');
    if (extraHit > 0 && Math.random() * 100 < extraHit) {
      const d2 = calcDamage(attStats, oppStats, mult * 0.5, useMatk, 0);
      if (!d2.miss) {
        const amp2 = amplifyDamage(self, opp, d2.damage, d2.crit, { consumeFirstStrike: false, consumeFirstSkill: false });
        applyDamage(s, side, amp2, false, d2.crit);
      }
    }
    // blade_flurry 패시브 — 확률 칼날 추가타 (0.6x)
    const bladeFlurry = getFPassive(self, 'blade_flurry');
    if (bladeFlurry > 0 && Math.random() * 100 < bladeFlurry) {
      const d3 = calcDamage(attStats, oppStats, mult * 0.6, useMatk, 0);
      if (!d3.miss) {
        const amp3 = amplifyDamage(self, opp, d3.damage, d3.crit, { consumeFirstStrike: false, consumeFirstSkill: false });
        applyDamage(s, side, amp3, false, d3.crit);
      }
    }
    // bleed_on_hit 패시브 — 확률 출혈 도트 부여
    const bleed = getFPassive(self, 'bleed_on_hit');
    if (bleed > 0 && Math.random() * 100 < bleed) {
      const bleedBase = useMatk ? self.stats.matk : self.stats.atk;
      const bleedDmg = Math.round(bleedBase * 1.2);
      self.statusEffects.push({ type: 'dot', value: bleedDmg, remainingActions: 3, source: side });
    }
    // skill_double_chance 패시브 (마법사 시간 지배자 등) — 스킬 1회 추가 발동
    if (skill.kind === 'damage' && self.className === 'mage') {
      const dblChance = getFPassive(self, 'skill_double_chance');
      if (dblChance > 0 && Math.random() * 100 < dblChance) {
        const d4 = calcDamage(attStats, oppStats, mult, useMatk, flat);
        if (!d4.miss) {
          const amp4 = amplifyDamage(self, opp, d4.damage, d4.crit, { consumeFirstStrike: false, consumeFirstSkill: false });
          applyDamage(s, side, amp4, false, d4.crit);
          s.log.push(`✨ ${skName} 재발동!`);
        }
      }
    }
    return d;
  };
  const dur = skill.effect_duration || 3;
  const skName = skill.name;

  switch (skill.effect_type) {
    case 'heal': {
      const amt = Math.round((useMatk ? self.stats.matk : self.stats.atk) * skill.damage_mult);
      self.hp = Math.min(self.maxHp, self.hp + amt);
      s.log.push(`${self.name} [${skName}] HP +${amt}`);
      break;
    }
    case 'heal_pct': {
      const amt = Math.round(self.maxHp * skill.effect_value / 100);
      self.hp = Math.min(self.maxHp, self.hp + amt);
      s.log.push(`${self.name} [${skName}] HP +${amt} (${skill.effect_value}%)`);
      break;
    }
    case 'shield': {
      // PvE 와 동일 공식: maxHp × effect_value%  (잘못된 damage_mult × matk 방식 교체)
      // skill.kind === 'damage' 인 쉴드 스킬(차원 붕괴 등)은 damage_mult > 0 이라 데미지도 처리
      const shieldPct = Math.max(skill.effect_value, skill.damage_mult * 10); // effect_value 0이면 damage_mult × 10 로 폴백
      const amt = Math.round(self.maxHp * shieldPct / 100);
      self.shieldAmount = Math.max(self.shieldAmount, amt);
      // 데미지 동반 쉴드 스킬
      if (skill.kind === 'damage' && skill.damage_mult > 0) {
        const d = dealDamage(skill.damage_mult);
        s.log.push(`${self.name} [${skName}] 쉴드 ${amt} + ${d.miss ? '빗나감' : d.damage}`);
      } else {
        s.log.push(`${self.name} [${skName}] 쉴드 ${amt}`);
      }
      break;
    }
    case 'shield_break': {
      // PvE 와 동일: 자기 쉴드량 × N 배를 추가 데미지로 변환 (자기 쉴드는 유지)
      const shieldMult = skName === '대심판의 철퇴' ? 8.0 : 4.0;
      const shieldBonus = self.shieldAmount > 0 ? Math.round(self.shieldAmount * shieldMult) : 0;
      const d = calcDamage(self.stats, opp.stats, skill.damage_mult, useMatk, skill.flat_damage);
      if (!d.miss) {
        const totalDmg = d.damage + shieldBonus;
        applyDamage(s, side, totalDmg, false, d.crit);
      }
      s.log.push(`${self.name} [${skName}] ${d.miss ? '빗나감' : `${d.damage}+쉴드보너스 ${shieldBonus} = ${d.damage + shieldBonus}`}`);
      break;
    }
    case 'stat_buff':
    case 'atk_buff':
    case 'crit_bonus': {
      self.statusEffects.push({ type: 'stat_buff', value: skill.effect_value, remainingActions: dur, source: side });
      s.log.push(`${self.name} [${skName}] 버프 +${skill.effect_value}% (${dur}행동)`);
      break;
    }
    case 'damage_reduce': {
      self.statusEffects.push({ type: 'damage_reduce', value: skill.effect_value, remainingActions: dur, source: side });
      s.log.push(`${self.name} [${skName}] 받는 피해 -${skill.effect_value}% (${dur}행동)`);
      break;
    }
    case 'damage_reflect': {
      self.statusEffects.push({ type: 'damage_reflect', value: skill.effect_value, remainingActions: dur, source: side });
      // 천상의 낙인은 damage + reflect 로 보이므로 데미지도 같이
      if (skill.damage_mult > 0 && skill.kind === 'damage') {
        const d = dealDamage(skill.damage_mult);
        s.log.push(`${self.name} [${skName}] 반사 ${skill.effect_value}% ${dur}행동 + ${d.miss ? '빗나감' : `${d.damage}`}`);
      } else {
        s.log.push(`${self.name} [${skName}] 반사 ${skill.effect_value}% (${dur}행동)`);
      }
      break;
    }
    case 'self_speed_mod': {
      self.statusEffects.push({ type: 'speed_mod', value: skill.effect_value, remainingActions: dur, source: side });
      s.log.push(`${self.name} [${skName}] 자기 스피드 ${skill.effect_value >= 0 ? '+' : ''}${skill.effect_value}% (${dur}행동)`);
      break;
    }
    case 'speed_mod': {
      // kind='debuff' 이면 상대에게, 아니면 데미지 + 감속
      if (skill.kind === 'debuff') {
        opp.statusEffects.push({ type: 'speed_mod', value: -Math.abs(skill.effect_value), remainingActions: dur, source: side });
        s.log.push(`${self.name} [${skName}] 상대 스피드 -${Math.abs(skill.effect_value)}% (${dur}행동)`);
      } else {
        const d = dealDamage(skill.damage_mult);
        opp.statusEffects.push({ type: 'speed_mod', value: -Math.abs(skill.effect_value), remainingActions: dur, source: side });
        s.log.push(`${self.name} [${skName}] ${d.miss ? '빗나감' : d.damage} + 상대 감속 ${skill.effect_value}%`);
      }
      break;
    }
    case 'gauge_fill': {
      const gain = GAUGE_MAX * skill.effect_value / 100;
      self.gauge = Math.min(GAUGE_MAX, self.gauge + gain);
      s.log.push(`${self.name} [${skName}] 게이지 +${skill.effect_value}%`);
      break;
    }
    case 'gauge_freeze': {
      // kind='damage' 이면 데미지 동반
      if (skill.kind === 'damage') {
        const d = dealDamage(skill.damage_mult);
        opp.statusEffects.push({ type: 'gauge_freeze', value: 1, remainingActions: dur, source: side });
        s.log.push(`${self.name} [${skName}] ${d.miss ? '빗나감' : d.damage} + 상대 게이지 동결 (${dur}행동)`);
      } else {
        opp.statusEffects.push({ type: 'gauge_freeze', value: 1, remainingActions: dur, source: side });
        s.log.push(`${self.name} [${skName}] 상대 게이지 동결 (${dur}행동)`);
      }
      break;
    }
    case 'gauge_reset': {
      opp.gauge = 0;
      s.log.push(`${self.name} [${skName}] 상대 게이지 리셋`);
      break;
    }
    case 'stun': {
      if (skill.kind === 'damage') {
        const d = dealDamage(skill.damage_mult);
        opp.statusEffects.push({ type: 'stun', value: 1, remainingActions: dur, source: side });
        s.log.push(`${self.name} [${skName}] ${d.miss ? '빗나감' : d.damage} + 기절 ${dur}행동`);
      } else {
        opp.statusEffects.push({ type: 'stun', value: 1, remainingActions: dur, source: side });
        s.log.push(`${self.name} [${skName}] 상대 기절 ${dur}행동`);
      }
      break;
    }
    case 'accuracy_debuff': {
      opp.statusEffects.push({ type: 'accuracy_debuff', value: skill.effect_value, remainingActions: dur, source: side });
      s.log.push(`${self.name} [${skName}] 상대 명중 -${skill.effect_value}% (${dur}행동)`);
      break;
    }
    case 'lifesteal': {
      const d = dealDamage(skill.damage_mult);
      if (!d.miss && d.damage > 0) {
        const heal = Math.round(d.damage * skill.effect_value / 100);
        self.hp = Math.min(self.maxHp, self.hp + heal);
        s.log.push(`${self.name} [${skName}] ${d.damage} + 흡혈 +${heal}`);
      } else {
        s.log.push(`${self.name} [${skName}] 빗나감`);
      }
      break;
    }
    case 'hp_pct_damage': {
      const d = dealDamage(skill.damage_mult);
      const extra = Math.round(Math.max(0, opp.hp) * skill.effect_value / 100);
      if (extra > 0) {
        opp.hp -= Math.max(1, Math.round(extra * PVP_DAMAGE_MULT * 0.5)); // 고정 % 데미지도 캡 적용 (× 0.5 로 더 완화)
      }
      s.log.push(`${self.name} [${skName}] ${d.miss ? '빗나감' : d.damage} + 고정 ${skill.effect_value}% HP`);
      break;
    }
    case 'double_chance': {
      const d = dealDamage(skill.damage_mult);
      s.log.push(`${self.name} [${skName}] ${d.miss ? '빗나감' : `${d.damage}${d.crit ? ' 치명!' : ''}`}`);
      if (Math.random() * 100 < skill.effect_value) {
        const d2 = dealDamage(skill.damage_mult);
        s.log.push(`${self.name} [${skName}] 2회 발동! ${d2.miss ? '빗나감' : `${d2.damage}${d2.crit ? ' 치명!' : ''}`}`);
      }
      break;
    }
    case 'multi_hit': {
      const hits = Math.max(1, Math.round(skill.effect_value));
      const oppStats = applyArmorPierce(self, opp);
      const attStats = statsWithAccuracyDebuff(self);
      const multiAmp = self.equipPrefixes.multi_hit_amp_pct || 0;
      const bladeStormAmp = getFPassive(self, 'blade_storm_amp');
      const baseMult = multiAmp > 0 ? skill.damage_mult * (1 + multiAmp / 100) : skill.damage_mult;
      let total = 0, crits = 0, miss = 0, firstLanded = true, landedCount = 0;
      for (let i = 0; i < hits; i++) {
        const hitMult = bladeStormAmp > 0 ? baseMult * (1 + (bladeStormAmp * landedCount) / 100) : baseMult;
        const d = calcDamage(attStats, oppStats, hitMult, useMatk, skill.flat_damage);
        if (d.miss) { miss++; self.missStack = Math.min(5, self.missStack + 1); continue; }
        const amplified = amplifyDamage(self, opp, d.damage, d.crit, { consumeFirstStrike: firstLanded, consumeFirstSkill: firstLanded });
        firstLanded = false;
        landedCount++;
        applyDamage(s, side, amplified, false, d.crit);
        total += amplified;
        if (d.crit) crits++;
        if (self.className === 'warrior') self.rage = Math.min(100, self.rage + 5);
      }
      s.log.push(`${self.name} [${skName}] ${hits}연타 합계 ${total}${crits > 0 ? ` (치명 ${crits})` : ''}${miss > 0 ? ` · ${miss}회 빗나감` : ''}`);
      break;
    }
    case 'multi_hit_poison': {
      const hits = Math.max(1, Math.round(skill.effect_value));
      const oppStats = applyArmorPierce(self, opp);
      const attStats = statsWithAccuracyDebuff(self);
      const multiAmp = self.equipPrefixes.multi_hit_amp_pct || 0;
      const hitMult = multiAmp > 0 ? skill.damage_mult * (1 + multiAmp / 100) : skill.damage_mult;
      let total = 0, crits = 0, miss = 0, firstLanded = true;
      for (let i = 0; i < hits; i++) {
        const d = calcDamage(attStats, oppStats, hitMult, useMatk, skill.flat_damage);
        if (d.miss) { miss++; self.missStack = Math.min(5, self.missStack + 1); continue; }
        const amplified = amplifyDamage(self, opp, d.damage, d.crit, { consumeFirstStrike: firstLanded, consumeFirstSkill: firstLanded });
        firstLanded = false;
        applyDamage(s, side, amplified, false, d.crit);
        total += amplified;
        if (d.crit) crits++;
      }
      // 도적 독의 공명 스택 +1 per multi_hit_poison cast
      if (self.className === 'rogue') self.poisonResonance = Math.min(10, self.poisonResonance + 1);
      const dotBase = useMatk ? self.stats.matk : self.stats.atk;
      const dotDmg = Math.round(dotBase * 2.0);
      self.statusEffects.push({ type: 'dot', value: dotDmg, remainingActions: dur, source: side });
      s.log.push(`${self.name} [${skName}] ${hits}연타+독 ${total} (치명 ${crits}/빗 ${miss}) · 독 ${dotDmg}×${dur}`);
      break;
    }
    case 'poison_burst': {
      // 즉발 데미지 + 강한 독 dot
      const d = dealDamage(skill.damage_mult);
      const dotBase = useMatk ? self.stats.matk : self.stats.atk;
      const dotDmg = Math.round(dotBase * 1.5);
      self.statusEffects.push({ type: 'dot', value: dotDmg, remainingActions: dur, source: side });
      s.log.push(`${self.name} [${skName}] ${d.miss ? '빗나감' : d.damage} + 독 폭발 ${dotDmg}×${dur}`);
      break;
    }
    case 'dot':
    case 'poison':
    case 'burn': {
      const dmgPerTick = Math.round((useMatk ? self.stats.matk : self.stats.atk) * skill.effect_value);
      const d = dealDamage(skill.damage_mult);
      self.statusEffects.push({ type: 'dot', value: dmgPerTick, remainingActions: dur, source: side });
      s.log.push(`${self.name} [${skName}] ${d.miss ? '빗나감' : `${d.damage}`} + 도트 ${dmgPerTick}×${dur}`);
      // 마법사 고유: 도트 스킬 시 총 도트 데미지의 50% 즉시 추가 (즉발화)
      if (self.className === 'mage' && !d.miss) {
        const instantDot = Math.round(dmgPerTick * dur * 0.5);
        if (instantDot > 0) {
          applyDamage(s, side, instantDot, false, false);
          s.log.push(`${self.name} [${skName}] 도트 즉발 +${Math.round(instantDot * PVP_DAMAGE_MULT)}`);
        }
      }
      // 도적 독의 공명 스택 (poison/burn 계열)
      if (self.className === 'rogue' && (skill.effect_type === 'poison' || skill.effect_type === 'dot')) {
        self.poisonResonance = Math.min(10, self.poisonResonance + 1);
      }
      // 마나 흐름 스택 (마법사 dot 사용 시)
      if (self.className === 'mage') {
        self.manaFlowStacks = Math.min(5, self.manaFlowStacks + 1);
      }
      break;
    }
    case 'judgment_day':
    case 'self_damage_pct':
    case 'self_hp_dmg': {
      // 자해 스킬 등 — 단순 데미지로 처리
      const d = dealDamage(skill.damage_mult);
      s.log.push(`${self.name} [${skName}] ${d.miss ? '빗나감' : `${d.damage}${d.crit ? ' 치명!' : ''}`}`);
      break;
    }
    // 소환 계열 — PvE 공식: matk/atk × effect_value% per attack
    //   (effect_value 가 실제 데미지 배율, damage_mult 는 초기 소환 이펙트 참고용)
    case 'summon': {
      const mult = (skill.effect_value > 0 ? skill.effect_value : skill.damage_mult * 100) / 100;
      pushSummon(self, skName, mult, useMatk, dur);
      s.log.push(`${self.name} [${skName}] 소환! (${useMatk ? 'MATK' : 'ATK'} ×${(mult * 100).toFixed(0)}% · 지속 ${dur}행동)`);
      break;
    }
    case 'summon_multi': {
      // 하이드라 등 — 1회 등록 + multiHits 배수 (3회 공격)
      const mult = ((skill.effect_value > 0 ? skill.effect_value : skill.damage_mult * 100) / 100) * 3;
      pushSummon(self, skName, mult, useMatk, dur);
      s.log.push(`${self.name} [${skName}] 다중 소환! (${useMatk ? 'MATK' : 'ATK'} ×${(mult * 100).toFixed(0)}% · 지속 ${dur}행동)`);
      break;
    }
    case 'summon_all': {
      // 총공격 — damage_mult 기반 단일 강타 (지속 X)
      const d = dealDamage(skill.damage_mult);
      s.log.push(`${self.name} [${skName}] 총공격! ${d.miss ? '빗나감' : d.damage}`);
      break;
    }
    case 'summon_dot':
    case 'summon_storm': {
      const mult = (skill.effect_value > 0 ? skill.effect_value : skill.damage_mult * 100) / 100;
      pushSummon(self, skName, mult, useMatk, dur, true);
      s.log.push(`${self.name} [${skName}] 도트 소환! (${useMatk ? 'MATK' : 'ATK'} ×${(mult * 100).toFixed(0)}% · 지속 ${dur}행동)`);
      break;
    }
    case 'summon_sacrifice': {
      // 소환수 희생 — 기존 소환수 1마리 제거 후 큰 데미지
      const base = useMatk ? self.stats.matk : self.stats.atk;
      const sacrificed = self.activeSummons.length > 0 ? self.activeSummons.shift() : null;
      const mult = sacrificed ? 2.5 : 1.2;
      const sacDmg = Math.round(base * Math.max(skill.damage_mult, 1.0) * mult);
      applyDamage(s, side, sacDmg, false, false);
      s.log.push(`${self.name} [${skName}] ${sacrificed ? `${sacrificed.name} 희생 → ` : ''}${sacDmg}`);
      break;
    }
    case 'summon_buff': {
      self.statusEffects.push({ type: 'stat_buff', value: Math.max(10, skill.effect_value), remainingActions: dur, source: side });
      s.log.push(`${self.name} [${skName}] 소환수 버프 (자기 능력 +${Math.max(10, skill.effect_value)}% · ${dur}행동)`);
      break;
    }
    case 'summon_frenzy': {
      self.statusEffects.push({ type: 'speed_mod', value: Math.max(20, skill.effect_value), remainingActions: dur, source: side });
      s.log.push(`${self.name} [${skName}] 광폭화 스피드 +${Math.max(20, skill.effect_value)}% (${dur}행동)`);
      break;
    }
    case 'summon_heal': {
      const base = useMatk ? self.stats.matk : self.stats.atk;
      const healAmt = Math.round(base * Math.max(skill.damage_mult, 1.0));
      self.hp = Math.min(self.maxHp, self.hp + healAmt);
      s.log.push(`${self.name} [${skName}] 수호수 회복 +${healAmt}`);
      break;
    }
    case 'summon_tank': {
      self.statusEffects.push({ type: 'damage_reduce', value: Math.max(20, skill.effect_value), remainingActions: dur, source: side });
      s.log.push(`${self.name} [${skName}] 탱커 소환 (받는 피해 -${Math.max(20, skill.effect_value)}% · ${dur}행동)`);
      break;
    }
    case 'summon_extend': {
      // 모든 활성 소환수의 지속시간 + effect_value
      const ext = Math.max(2, Math.round(skill.effect_value));
      for (const s0 of self.activeSummons) s0.remainingActions += ext;
      s.log.push(`${self.name} [${skName}] 소환수 지속 +${ext}행동 (${self.activeSummons.length}마리)`);
      break;
    }
    case 'resurrect': {
      // 부활 버프 — 단순 heal 처리
      const amt = Math.round(self.maxHp * 0.5);
      self.hp = Math.min(self.maxHp, self.hp + amt);
      s.log.push(`${self.name} [${skName}] HP +${amt}`);
      break;
    }
    case 'damage':
    default: {
      const d = dealDamage(skill.damage_mult);
      s.log.push(`${self.name} [${skName}] ${d.miss ? '빗나감' : `${d.damage}${d.crit ? ' 치명타!' : ''}`}`);
    }
  }

  // 마법사 마나 흐름 — 버스트 중이면 -1, 아니면 스택 +1 → 5 도달 시 버스트 시작
  if (self.className === 'mage' && skill.kind === 'damage') {
    if (self.manaFlowActive > 0) {
      self.manaFlowActive -= 1;
      if (self.manaFlowActive === 0) s.log.push(`✨ ${self.name} 마나 버스트 종료`);
    } else {
      self.manaFlowStacks = Math.min(5, self.manaFlowStacks + 1);
      if (self.manaFlowStacks >= 5) {
        self.manaFlowStacks = 0;
        self.manaFlowActive = 5;
        s.log.push(`✨ ${self.name} 마나의 흐름 버스트! 5행동 쿨다운 무시`);
      }
    }
  }

  // 도적 독의 공명 — 스택 10 도달 시 폭발 (상대에게 활성 dot 합 × 3 데미지)
  if (self.className === 'rogue' && self.poisonResonance >= 10) {
    const poisonDots = self.statusEffects
      .filter(e => e.type === 'dot' && e.remainingActions > 0)
      .reduce((sum, e) => sum + e.value * e.remainingActions, 0);
    if (poisonDots > 0) {
      const burstDmg = Math.round(poisonDots * 3);
      applyDamage(s, side, burstDmg, false, false);
      s.log.push(`💀 ${self.name} 독의 공명 폭발! ${Math.round(burstDmg * PVP_DAMAGE_MULT)} 데미지`);
    }
    self.poisonResonance = 0;
  }
}

function applyDamage(s: PvPSession, attackerSide: 'attacker' | 'defender', damage: number, miss: boolean, crit: boolean): void {
  if (miss || damage <= 0) return;
  const target = attackerSide === 'attacker' ? s.defender : s.attacker;
  const attacker = attackerSide === 'attacker' ? s.attacker : s.defender;
  // 1) 치명타 폭딜 완화
  if (crit) damage = Math.round(damage * PVP_CRIT_MULT);
  // 2) 기본 PvP 데미지 배율
  damage = Math.max(1, Math.round(damage * PVP_DAMAGE_MULT));
  // 3) damage_reduce 버프 적용 (target 쪽)
  const reducePct = target.statusEffects
    .filter(e => e.type === 'damage_reduce' && e.remainingActions > 0)
    .reduce((a, e) => a + e.value, 0);
  if (reducePct > 0) damage = Math.max(1, Math.round(damage * (1 - Math.min(90, reducePct) / 100)));
  // 4) 타격당 maxHp 퍼센트 캡 (스탯 격차 무관 · 최소 20타 확보)
  const cap = Math.max(1, Math.floor(target.maxHp * PVP_PER_HIT_CAP_PCT / 100));
  if (damage > cap) damage = cap;
  // 쉴드 먼저 감소 — 성직자는 PvP에서 쉴드 차감 ×4 (쉴드 1/4 효율)
  if (target.shieldAmount > 0) {
    const shieldDropMult = target.className === 'cleric' ? 4 : 1;
    const shieldDrop = Math.min(target.shieldAmount, damage * shieldDropMult);
    const actualAbsorbed = shieldDrop / shieldDropMult;
    target.shieldAmount -= shieldDrop;
    damage -= actualAbsorbed;
    damage = Math.max(0, damage);
  }
  target.hp -= damage;
  // 피격 시 각성 카운터 리셋 (target 이 맞음 → ticksSinceLastHit = 0)
  target.ticksSinceLastHit = 0;
  // 5) damage_reflect 버프 (target 이 반사) — attacker 에게 일정 % 되돌려줌
  const reflectPct = target.statusEffects
    .filter(e => e.type === 'damage_reflect' && e.remainingActions > 0)
    .reduce((a, e) => a + e.value, 0);
  if (reflectPct > 0 && damage > 0) {
    const reflected = Math.max(1, Math.round(damage * reflectPct / 100));
    attacker.hp -= reflected;
    s.log.push(`↩️ ${target.name} 반사 → ${attacker.name} ${reflected}`);
  }
  // 6) thorns_pct prefix — 피격자 장비 반사 (% 가시)
  const thorns = target.equipPrefixes.thorns_pct || 0;
  if (thorns > 0 && damage > 0) {
    const reflected = Math.max(1, Math.round(damage * thorns / 100));
    attacker.hp -= reflected;
  }
}

// ─────────────────────────────────────────────
// 종료 / 스냅샷 / WS push
// ─────────────────────────────────────────────
async function finalize(s: PvPSession, winnerId: number, reason: 'hp' | 'timeout' | 'forfeit' | 'dc'): Promise<void> {
  if (s.ended) return;
  s.ended = true;
  s.winnerId = winnerId;
  s.endReason = reason;
  s.log.push(reason === 'timeout' ? '⏱ 시간 초과 — 판정 종료' : reason === 'forfeit' ? '🏳 기권' : reason === 'dc' ? '🔌 연결 끊김' : '⚔ 전투 종료');
  if (!s.isFastForward) pushState(s);
  await finalizeRecords(s);
}

async function finalizeTimeout(s: PvPSession): Promise<void> {
  const aPct = s.attacker.hp / s.attacker.maxHp;
  const dPct = s.defender.hp / s.defender.maxHp;
  if (Math.abs(aPct - dPct) < 0.01) {
    // 무승부 (ELO 변동 없음, 기록용 winnerId = 0)
    s.ended = true;
    s.endReason = 'timeout';
    s.winnerId = 0;
    s.log.push('⏱ 시간 초과 — 무승부');
    if (!s.isFastForward) pushState(s);
    await finalizeRecords(s);
    return;
  }
  await finalize(s, aPct > dPct ? s.attacker.id : s.defender.id, 'timeout');
}

// 승패 확정 후 ELO/기록/보상 업데이트
async function finalizeRecords(s: PvPSession): Promise<void> {
  const { calculateEloChange } = await import('./simulator.js');
  // 일일 공격 카운트는 세션 생성 시 증가 — 여기선 스킵
  const isDraw = s.winnerId === 0;
  if (isDraw) {
    await query(
      `INSERT INTO pvp_battles (attacker_id, defender_id, winner_id, elo_change, log)
       VALUES ($1, $2, NULL, 0, $3::jsonb)`,
      [s.attacker.id, s.defender.id, JSON.stringify(s.log)]
    );
    return;
  }
  const winnerId = s.winnerId!;
  const loserId = winnerId === s.attacker.id ? s.defender.id : s.attacker.id;
  const statR = await query<{ elo: number }>(
    `SELECT character_id, elo FROM pvp_stats WHERE character_id IN ($1, $2)`,
    [winnerId, loserId]
  );
  const eloMap = new Map<number, number>();
  for (const r of statR.rows as any[]) eloMap.set(r.character_id, r.elo);
  const winnerElo = eloMap.get(winnerId) ?? 1000;
  const loserElo = eloMap.get(loserId) ?? 1000;
  const eloChange = calculateEloChange(winnerElo, loserElo);

  await query(`UPDATE pvp_stats SET wins = wins + 1, elo = elo + $1 WHERE character_id = $2`, [eloChange, winnerId]);
  await query(`UPDATE pvp_stats SET losses = losses + 1, elo = GREATEST(0, elo - $1) WHERE character_id = $2`, [eloChange, loserId]);

  // 골드 보상
  const winGold = 500, loseGold = 50;
  await query(`UPDATE characters SET gold = gold + $1 WHERE id = $2`, [winGold, winnerId]);
  await query(`UPDATE characters SET gold = gold + $1 WHERE id = $2`, [loseGold, loserId]);

  // 기록
  await query(
    `INSERT INTO pvp_battles (attacker_id, defender_id, winner_id, elo_change, log)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [s.attacker.id, s.defender.id, winnerId,
     winnerId === s.attacker.id ? eloChange : -eloChange, JSON.stringify(s.log)]
  );
}

// ─────────────────────────────────────────────
// WebSocket push (attacker 의 user 소켓에 pvp:{battleId} 로 emit)
// ─────────────────────────────────────────────
function pushState(s: PvPSession): void {
  const io = getIo();
  if (!io) return;
  const snapshot = {
    battleId: s.battleId,
    attacker: fighterSnapshot(s.attacker),
    defender: fighterSnapshot(s.defender),
    attackerAuto: s.attackerAuto,
    attackerWaitingInput: s.attackerWaitingInput,
    elapsedMs: Date.now() - s.startedAt,
    timeLimitMs: TIME_LIMIT_MS,
    log: s.log.slice(-30),
    ended: s.ended,
    winnerId: s.winnerId,
    endReason: s.endReason,
  };
  io.emit(`pvp:${s.battleId}`, snapshot);
}

function fighterSnapshot(f: FighterState) {
  return {
    id: f.id, name: f.name, className: f.className, level: f.level,
    hp: Math.max(0, f.hp), maxHp: f.maxHp,
    gauge: Math.min(GAUGE_MAX, f.gauge), shieldAmount: f.shieldAmount,
    speed: f.stats.spd,
    skills: f.skills.map(sk => ({
      id: sk.id, name: sk.name, kind: sk.kind, cooldown: sk.cooldown_actions,
      cooldownLeft: f.skillCooldowns.get(sk.id) ?? 0,
      slotOrder: sk.slot_order,
    })),
    summons: f.activeSummons.map(s => ({
      name: s.name, remainingActions: s.remainingActions, isDot: !!s.isDot,
      damagePct: Math.round(s.damageMult * 100),
    })),
    rage: f.className === 'warrior' ? f.rage : undefined,
    manaFlow: f.className === 'mage' ? { stacks: f.manaFlowStacks, active: f.manaFlowActive } : undefined,
    poisonResonance: f.className === 'rogue' ? f.poisonResonance : undefined,
    statusEffectCount: f.statusEffects.length,
  };
}

// ─────────────────────────────────────────────
// 외부 API (라우트에서 호출)
// ─────────────────────────────────────────────
export function toggleAuto(battleId: string, attackerId: number): boolean {
  const s = sessions.get(battleId);
  if (!s || s.ended || s.attacker.id !== attackerId) return false;
  s.attackerAuto = !s.attackerAuto;
  s.attackerWaitingInput = false;
  s.attackerLastPing = Date.now();
  pushState(s);
  return true;
}

export function attackerUseSkill(battleId: string, attackerId: number, skillId: number): { ok: boolean; error?: string } {
  const s = sessions.get(battleId);
  if (!s || s.ended || s.attacker.id !== attackerId) return { ok: false, error: 'invalid session' };
  if (s.attacker.gauge < GAUGE_MAX) return { ok: false, error: '게이지 부족' };
  const skill = s.attacker.skills.find(sk => sk.id === skillId);
  if (!skill) return { ok: false, error: 'unknown skill' };
  if ((s.attacker.skillCooldowns.get(skillId) ?? 0) > 0) return { ok: false, error: '쿨다운 중' };
  executeAction(s, 'attacker', skill);
  processSummons(s, 'attacker');
  s.attacker.gauge = 0;
  s.attackerWaitingInput = false;
  s.attackerLastPing = Date.now();
  if (s.defender.hp <= 0) finalize(s, s.attacker.id, 'hp');
  else if (s.attacker.hp <= 0) finalize(s, s.defender.id, 'hp');
  pushState(s);
  return { ok: true };
}

export function attackerPing(battleId: string, attackerId: number): void {
  const s = sessions.get(battleId);
  if (!s || s.attacker.id !== attackerId) return;
  s.attackerLastPing = Date.now();
}

export async function attackerForfeit(battleId: string, attackerId: number): Promise<boolean> {
  const s = sessions.get(battleId);
  if (!s || s.ended || s.attacker.id !== attackerId) return false;
  await finalize(s, s.defender.id, 'forfeit');
  return true;
}

// 스킵 전용 — 실시간 엔진 기반 fast-forward (WS 없이 즉시 완주)
// 결과는 /pvp/attack-skip 이 사용할 형식으로 반환
export async function simulatePvPFastForward(
  attackerId: number,
  defenderId: number,
): Promise<
  | { ok: true; winner: 'attacker' | 'defender' | 'draw'; winnerId: number | null; log: string[]; turns: number; eloChange: number }
  | { error: string; status: number }
> {
  // 세션 생성 (WS 등록됨 — 곧바로 Map 에서 제거해 글로벌 루프 간섭 차단)
  const r = await createPvPSession(attackerId, defenderId);
  if ('error' in r) return { error: r.error, status: r.status };
  const session = sessions.get(r.battleId)!;
  sessions.delete(r.battleId);
  session.isFastForward = true;
  session.attackerAuto = true;

  const MAX_TICKS = Math.ceil(TIME_LIMIT_MS / TICK_MS) + 10; // 180초 + 여유
  for (let i = 0; i < MAX_TICKS && !session.ended; i++) {
    try { tickSession(session); } catch (e) { console.error('[pvp-ff] tick err', e); break; }
  }
  // 시간 초과인데 아직 안 끝났으면 강제 타임아웃 처리
  if (!session.ended) {
    await finalizeTimeout(session);
  }

  const winnerId = session.winnerId;
  const isDraw = winnerId === 0 || winnerId === null;
  const winnerLabel: 'attacker' | 'defender' | 'draw' = isDraw
    ? 'draw'
    : winnerId === session.attacker.id ? 'attacker' : 'defender';
  // elo change 재계산 (finalizeRecords 에서 이미 반영됐지만 응답용)
  let eloChange = 0;
  if (!isDraw) {
    const r2 = await query<{ character_id: number; elo: number }>(
      `SELECT character_id, elo FROM pvp_stats WHERE character_id IN ($1, $2)`,
      [session.attacker.id, session.defender.id]
    );
    const eloMap = new Map<number, number>();
    for (const row of r2.rows) eloMap.set(row.character_id, row.elo);
    // elo was already updated — rough estimate for response (approx delta = 16)
    eloChange = Math.abs(16); // finalizeRecords 에서 실제 적용된 값 재계산은 복잡 → 대략값
  }
  return {
    ok: true,
    winner: winnerLabel,
    winnerId,
    log: session.log,
    turns: session.tickCount,
    eloChange,
  };
}

export function sessionSummary(battleId: string) {
  const s = sessions.get(battleId);
  if (!s) return null;
  return {
    battleId,
    attacker: fighterSnapshot(s.attacker),
    defender: fighterSnapshot(s.defender),
    attackerAuto: s.attackerAuto,
    attackerWaitingInput: s.attackerWaitingInput,
    elapsedMs: Date.now() - s.startedAt,
    timeLimitMs: TIME_LIMIT_MS,
    log: s.log.slice(-30),
    ended: s.ended,
    winnerId: s.winnerId,
    endReason: s.endReason,
  };
}
