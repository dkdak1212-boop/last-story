import type { Stats } from './classes.js';

export interface EffectiveStats extends Stats {
  maxHp: number;
  maxMp: number;
  atk: number;      // 물리 공격
  matk: number;     // 마법 공격
  def: number;
  mdef: number;
  dodge: number;    // 회피 %
  accuracy: number; // 명중 %
  tickMs: number;   // 행동 간격
}

// 장비 스탯 합산
export function sumEquipmentStats(equippedItems: { stats: Partial<Stats> | null }[]): Partial<Stats> {
  const acc: Partial<Stats> = {};
  for (const it of equippedItems) {
    if (!it.stats) continue;
    for (const [k, v] of Object.entries(it.stats)) {
      acc[k as keyof Stats] = (acc[k as keyof Stats] ?? 0) + (v as number);
    }
  }
  return acc;
}

// 기본 스탯 + 장비 스탯 → 유효 스탯
export function computeEffective(
  base: Stats,
  baseMaxHp: number,
  baseMaxMp: number,
  equipBonus: Partial<Stats>
): EffectiveStats {
  const str = base.str + (equipBonus.str ?? 0);
  const dex = base.dex + (equipBonus.dex ?? 0);
  const intl = base.int + (equipBonus.int ?? 0);
  const vit = base.vit + (equipBonus.vit ?? 0);
  const spd = base.spd + (equipBonus.spd ?? 0);
  const cri = base.cri + (equipBonus.cri ?? 0);

  // 장비가 주는 vit/int는 max HP/MP에 추가
  const equipVit = equipBonus.vit ?? 0;
  const equipInt = equipBonus.int ?? 0;
  const maxHp = baseMaxHp + equipVit * 10;
  const maxMp = baseMaxMp + equipInt * 4;

  const atk = str * 1.0;
  const matk = intl * 1.2;
  const def = vit * 0.8;
  const mdef = intl * 0.5;
  const dodge = dex * 0.4;
  const accuracy = 80 + dex * 0.5;
  const tickMs = clamp(2000 / (spd / 100), 500, 5000);

  return { str, dex, int: intl, vit, spd, cri, maxHp, maxMp, atk, matk, def, mdef, dodge, accuracy, tickMs };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
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
  useMatk: boolean
): DamageResult {
  // 회피
  if (Math.random() * 100 < defender.dodge) {
    return { damage: 0, crit: false, miss: true };
  }
  const rawAtk = useMatk ? attacker.matk : attacker.atk;
  const def = useMatk ? defender.mdef : defender.def;
  let base = rawAtk - def * 0.5;
  base = Math.max(1, base);
  base = base * skillMult;
  // 치명타
  const crit = Math.random() * 100 < attacker.cri;
  if (crit) base *= 1.5;
  // ±10% 랜덤
  base *= 0.9 + Math.random() * 0.2;
  return { damage: Math.round(base), crit, miss: false };
}
