// 경험치 / 레벨 관련 — v0.9
// 레벨업 시 직업별 스탯 성장 + 노드 포인트 +2 + maxHp +8

export function expToNext(level: number): number {
  if (level <= 30) {
    return Math.floor(50 * level * Math.pow(level, 0.6));
  } else if (level <= 60) {
    return Math.floor(80 * level * Math.pow(level, 1.0));
  } else {
    const base60 = 80 * 60 * 60; // 288,000
    const scale = Math.pow((level - 60) / 10 + 1, 2.2);
    return Math.floor(base60 * scale);
  }
}

// 직업별 레벨당 스탯 성장
export const CLASS_GROWTH: Record<string, { str: number; dex: number; int: number; vit: number; spd: number; cri: number }> = {
  warrior: { str: 3, dex: 1, int: 0, vit: 2, spd: 5, cri: 1 },
  mage:    { str: 0, dex: 1, int: 3, vit: 1, spd: 4, cri: 1 },
  cleric:  { str: 1, dex: 1, int: 2, vit: 2, spd: 3, cri: 1 },
  rogue:   { str: 2, dex: 3, int: 0, vit: 1, spd: 6, cri: 2 },
};

export interface LevelUpResult {
  newLevel: number;
  newExp: number;
  levelsGained: number;
  hpGained: number;        // +8 per level
  nodePointsGained: number; // +2 per level
  statGrowth: { str: number; dex: number; int: number; vit: number; spd: number; cri: number };
}

export function applyExpGain(
  currentLevel: number,
  currentExp: number,
  expGained: number,
  className: string = 'warrior'
): LevelUpResult {
  let level = currentLevel;
  let exp = currentExp + expGained;
  let hpGained = 0;
  let nodePointsGained = 0;
  const growth = CLASS_GROWTH[className] || CLASS_GROWTH.warrior;
  const statGrowth = { str: 0, dex: 0, int: 0, vit: 0, spd: 0, cri: 0 };

  while (level < 100 && exp >= expToNext(level)) {
    exp -= expToNext(level);
    level += 1;
    hpGained += 8;
    nodePointsGained += 2;
    statGrowth.str += growth.str;
    statGrowth.dex += growth.dex;
    statGrowth.int += growth.int;
    statGrowth.vit += growth.vit;
    statGrowth.spd += growth.spd;
    statGrowth.cri += growth.cri;
  }

  return {
    newLevel: level,
    newExp: exp,
    levelsGained: level - currentLevel,
    hpGained,
    nodePointsGained,
    statGrowth,
  };
}
