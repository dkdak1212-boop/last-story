// PvP 실시간 전투 엔진
// PvE engine.ts 와 독립. 100ms 틱, 양측 게이지 기반, 방어자는 AI 로직 + 공격자는 수동/자동.

import { randomUUID } from 'node:crypto';
import { query } from '../db/pool.js';
import { calcDamage, type EffectiveStats } from '../game/formulas.js';
import { loadCharacter, getEffectiveStats, getNodePassives } from '../game/character.js';
import { loadEquipPrefixes, getCharSkills, buildPassiveMap, type SkillDef } from '../combat/engine.js';
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
      statusEffects: [], shieldAmount: 0,
    },
    defender: {
      id: defenderId, name: defMeta.name, className: defMeta.class_name, level: defMeta.level,
      hp: L.effective_stats.maxHp * PVP_HP_MULT, maxHp: L.effective_stats.maxHp * PVP_HP_MULT, gauge: 0,
      stats: L.effective_stats, skills: defSkills, passives: defPassives,
      equipPrefixes: L.equip_prefixes || {},
      skillCooldowns: new Map(), skillLastUsed: new Map(),
      statusEffects: [], shieldAmount: 0,
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
  sessions.set(battleId, session);
  ensureLoop();
  pushState(session);
  return { battleId };
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

  // 시간 초과 체크
  if (now - s.startedAt >= TIME_LIMIT_MS) {
    finalizeTimeout(s);
    return;
  }

  // 공격자 DC 체크 (30초 ping 없음)
  if (now - s.attackerLastPing > 30_000) {
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

  // 공격자 행동 판정
  if (s.attacker.gauge >= GAUGE_MAX) {
    if (s.attackerAuto) {
      const pick = pickAttackerAuto(s);
      executeAction(s, 'attacker', pick);
      s.attacker.gauge = 0;
    } else {
      if (!s.attackerWaitingInput) {
        s.attackerWaitingInput = true;
        s.attackerWaitingSince = now;
      } else if (now - s.attackerWaitingSince >= MANUAL_TIMEOUT_MS) {
        // 타임아웃 → 자동 발동
        const pick = pickAttackerAuto(s);
        executeAction(s, 'attacker', pick);
        s.attacker.gauge = 0;
        s.attackerWaitingInput = false;
      }
    }
  }

  // 방어자 AI 행동
  if (s.defender.gauge >= GAUGE_MAX) {
    const pick = pickDefenderAI(s);
    executeAction(s, 'defender', pick);
    s.defender.gauge = 0;
  }

  // 상태 이상 틱 (dot)
  tickDots(s);

  // 승패 체크
  if (s.attacker.hp <= 0) { void finalize(s, s.defender.id, 'hp'); return; }
  if (s.defender.hp <= 0) { void finalize(s, s.attacker.id, 'hp'); return; }

  pushState(s);
}

function tickDots(s: PvPSession): void {
  const processEffect = (fighter: FighterState, target: FighterState) => {
    for (let i = fighter.statusEffects.length - 1; i >= 0; i--) {
      const eff = fighter.statusEffects[i];
      if (eff.type === 'dot') {
        // 도트도 동일 PvP 보정 + HP% 캡 적용
        let d = Math.max(1, Math.round(eff.value * PVP_DAMAGE_MULT));
        const cap = Math.max(1, Math.floor(target.maxHp * PVP_PER_HIT_CAP_PCT / 100));
        if (d > cap) d = cap;
        target.hp -= d;
        eff.remainingActions -= 1;
        if (eff.remainingActions <= 0) fighter.statusEffects.splice(i, 1);
      }
    }
  };
  // attacker 가 걸어놓은 dot → defender 에게 적용
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

  // 쿨다운 등록
  if (skill.cooldown_actions > 0) self.skillCooldowns.set(skill.id, skill.cooldown_actions);
  self.skillLastUsed.set(skill.id, s.tickCount);

  const useMatk = skill.kind === 'magic' || skill.kind === 'heal'
    || self.className === 'mage' || self.className === 'cleric';

  // 편의 함수
  const dealDamage = (mult: number, flat = skill.flat_damage) => {
    const d = calcDamage(self.stats, opp.stats, mult, useMatk, flat);
    if (!d.miss) applyDamage(s, side, d.damage, false, d.crit);
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
      const amt = Math.round((useMatk ? self.stats.matk : self.stats.atk) * skill.damage_mult);
      self.shieldAmount = Math.max(self.shieldAmount, amt);
      s.log.push(`${self.name} [${skName}] 쉴드 ${amt}`);
      break;
    }
    case 'shield_break': {
      opp.shieldAmount = 0;
      const d = dealDamage(skill.damage_mult);
      s.log.push(`${self.name} [${skName}] 쉴드 파괴 + ${d.miss ? '빗나감' : `${d.damage} 데미지`}`);
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
      let total = 0, crits = 0, miss = 0;
      for (let i = 0; i < hits; i++) {
        const d = calcDamage(self.stats, opp.stats, skill.damage_mult, useMatk, skill.flat_damage);
        if (d.miss) { miss++; continue; }
        applyDamage(s, side, d.damage, false, d.crit);
        total += d.damage;
        if (d.crit) crits++;
      }
      s.log.push(`${self.name} [${skName}] ${hits}연타 합계 ${total}${crits > 0 ? ` (치명 ${crits})` : ''}${miss > 0 ? ` · ${miss}회 빗나감` : ''}`);
      break;
    }
    case 'multi_hit_poison': {
      const hits = Math.max(1, Math.round(skill.effect_value));
      let total = 0, crits = 0, miss = 0;
      for (let i = 0; i < hits; i++) {
        const d = calcDamage(self.stats, opp.stats, skill.damage_mult, useMatk, skill.flat_damage);
        if (d.miss) { miss++; continue; }
        applyDamage(s, side, d.damage, false, d.crit);
        total += d.damage;
        if (d.crit) crits++;
      }
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
    // 소환 계열 — MVP: 기본 데미지로 대체, 소환수 미복원
    case 'summon':
    case 'summon_all':
    case 'summon_buff':
    case 'summon_dot':
    case 'summon_extend':
    case 'summon_frenzy':
    case 'summon_heal':
    case 'summon_multi':
    case 'summon_sacrifice':
    case 'summon_storm':
    case 'summon_tank':
    case 'resurrect': {
      const d = dealDamage(Math.max(skill.damage_mult, 1.0));
      s.log.push(`${self.name} [${skName}] (PvP 단순화) ${d.miss ? '빗나감' : d.damage}`);
      break;
    }
    case 'damage':
    default: {
      const d = dealDamage(skill.damage_mult);
      s.log.push(`${self.name} [${skName}] ${d.miss ? '빗나감' : `${d.damage}${d.crit ? ' 치명타!' : ''}`}`);
    }
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
  // 쉴드 먼저 감소
  if (target.shieldAmount > 0) {
    const absorbed = Math.min(target.shieldAmount, damage);
    target.shieldAmount -= absorbed;
    damage -= absorbed;
  }
  target.hp -= damage;
  // 5) damage_reflect 버프 (target 이 반사) — attacker 에게 일정 % 되돌려줌 (캡 적용 X 로 반사는 이미 작은 양)
  const reflectPct = target.statusEffects
    .filter(e => e.type === 'damage_reflect' && e.remainingActions > 0)
    .reduce((a, e) => a + e.value, 0);
  if (reflectPct > 0 && damage > 0) {
    const reflected = Math.max(1, Math.round(damage * reflectPct / 100));
    attacker.hp -= reflected;
    s.log.push(`↩️ ${target.name} 반사 → ${attacker.name} ${reflected}`);
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
  pushState(s);
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
    pushState(s);
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
