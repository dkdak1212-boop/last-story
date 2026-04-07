// 전투 공식 — v0.9 게이지 기반
import type { Stats } from './classes.js';

export interface EffectiveStats extends Stats {
  maxHp: number;
  atk: number;      // 물리 공격
  matk: number;     // 마법 공격
  def: number;
  mdef: number;
  dodge: number;    // 회피 %
  accuracy: number; // 명중 %
}

// 장비 스탯 합산
export function sumEquipmentStats(
  equippedItems: { stats: Partial<Stats> | null; prefixStats?: Record<string, number> | null }[]
): Partial<Stats> & { bonusDodge?: number; bonusAccuracy?: number } {
  const acc: Partial<Stats> & { bonusDodge?: number; bonusAccuracy?: number } = {};
  for (const it of equippedItems) {
    if (!it.stats) continue;
    for (const [k, v] of Object.entries(it.stats)) {
      acc[k as keyof Stats] = (acc[k as keyof Stats] ?? 0) + (v as number);
    }
    if (it.prefixStats) {
      if (it.prefixStats.dodge) acc.bonusDodge = (acc.bonusDodge ?? 0) + it.prefixStats.dodge;
      if (it.prefixStats.accuracy) acc.bonusAccuracy = (acc.bonusAccuracy ?? 0) + it.prefixStats.accuracy;
    }
  }
  return acc;
}

// 노드 스탯 합산
export function sumNodeStats(nodeEffects: { type: string; stat?: string; value: number }[]): Partial<Stats> {
  const acc: Partial<Stats> = {};
  for (const e of nodeEffects) {
    if (e.type === 'stat' && e.stat) {
      acc[e.stat as keyof Stats] = (acc[e.stat as keyof Stats] ?? 0) + e.value;
    }
  }
  return acc;
}

// 기본 스탯 + 장비 스탯 + 노드 스탯 → 유효 스탯
export function computeEffective(
  base: Stats,
  baseMaxHp: number,
  equipBonus: Partial<Stats> & { bonusDodge?: number; bonusAccuracy?: number },
  nodeBonus: Partial<Stats> = {}
): EffectiveStats {
  const str = base.str + (equipBonus.str ?? 0) + (nodeBonus.str ?? 0);
  const dex = base.dex + (equipBonus.dex ?? 0) + (nodeBonus.dex ?? 0);
  const intl = base.int + (equipBonus.int ?? 0) + (nodeBonus.int ?? 0);
  const vit = base.vit + (equipBonus.vit ?? 0) + (nodeBonus.vit ?? 0);
  const spd = base.spd + (equipBonus.spd ?? 0) + (nodeBonus.spd ?? 0);
  const cri = base.cri + (equipBonus.cri ?? 0) + (nodeBonus.cri ?? 0);

  const equipVit = (equipBonus.vit ?? 0) + (nodeBonus.vit ?? 0);
  const maxHp = baseMaxHp + equipVit * 10;

  const atk = str * 1.0;
  const matk = intl * 1.2;
  const def = vit * 0.8;
  const mdef = intl * 0.5;
  // 회피: DEX 계수 하향 + 상한 30%
  const dodgeRaw = dex * 0.2 + (equipBonus.bonusDodge ?? 0);
  const dodge = Math.min(30, dodgeRaw);
  // 명중: 상한 100%
  const accuracyRaw = 80 + dex * 0.3 + (equipBonus.bonusAccuracy ?? 0);
  const accuracy = Math.min(100, accuracyRaw);
  // 치명타 확률: 상한 100% (노드/장비로 쌓아올리는 스탯)
  const criCapped = Math.min(100, cri);

  return { str, dex, int: intl, vit, spd, cri: criCapped, maxHp, atk, matk, def, mdef, dodge, accuracy };
}

export interface DamageResult {
  damage: number;
  crit: boolean;
  miss: boolean;
}

export function calcDamage(
  attacker: EffectiveStats,
  defender: EffectiveStats,
  skillMult: number,
  useMatk: boolean,
  flatDamage: number = 0,
  criBonus: number = 0
): DamageResult {
  // 회피
  if (Math.random() * 100 < defender.dodge) {
    return { damage: 0, crit: false, miss: true };
  }
  const rawAtk = useMatk ? attacker.matk : attacker.atk;
  const defVal = useMatk ? defender.mdef : defender.def;
  let base = rawAtk - defVal * 0.5;
  base = Math.max(1, base);
  base = base * skillMult + flatDamage;
  // 치명타 (확률 어렵게, 데미지 강하게)
  const crit = Math.random() * 100 < (attacker.cri + criBonus);
  if (crit) base *= 2.0;
  // ±10% 랜덤
  base *= 0.9 + Math.random() * 0.2;
  return { damage: Math.round(Math.max(1, base)), crit, miss: false };
}
