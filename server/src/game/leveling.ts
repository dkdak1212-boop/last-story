// 경험치 / 레벨 관련 — v0.9
// 레벨업 시 직업별 스탯 성장 + 노드 포인트 +2 + maxHp +8

// 밸런스 v3: 경험치 요구량 대폭 상향 (졸업까지 최소 1~2개월)
export function expToNext(level: number): number {
  if (level <= 30) {
    return Math.floor(120 * level * Math.pow(level, 0.8));
  } else if (level <= 60) {
    return Math.floor(200 * level * Math.pow(level, 1.1));
  } else {
    const base60 = 200 * 60 * Math.pow(60, 1.1);
    const scale = Math.pow((level - 60) / 8 + 1, 2.5);
    return Math.floor(base60 * scale);
  }
}

// 직업별 레벨당 스탯 성장 (밸런스 v2: 하향 조정)
// 밸런스 v3: 치명타 성장 극소화, 나머지 유지
export const CLASS_GROWTH: Record<string, { str: number; dex: number; int: number; vit: number; spd: number; cri: number }> = {
  warrior: { str: 2, dex: 0.5, int: 0, vit: 1.5, spd: 2, cri: 0.1 },
  mage:    { str: 0, dex: 0.5, int: 2, vit: 0.8, spd: 2, cri: 0.1 },     // vit 0.5→0.8, spd 1.5→2
  cleric:  { str: 0.5, dex: 0.5, int: 1.5, vit: 1.2, spd: 1.5, cri: 0.1 }, // vit 1→1.2, spd 1→1.5
  rogue:   { str: 1, dex: 1.5, int: 0, vit: 0.5, spd: 2.5, cri: 0.15 },   // spd 3→2.5, cri 0.2→0.15
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

  const levelsStart = level;
  while (level < 100 && exp >= expToNext(level)) {
    exp -= expToNext(level);
    level += 1;
    hpGained += 8;
    nodePointsGained += 2;
  }
  // 소수점 성장 누적 후 정수 변환
  const gained = level - levelsStart;
  statGrowth.str = Math.floor(growth.str * gained);
  statGrowth.dex = Math.floor(growth.dex * gained);
  statGrowth.int = Math.floor(growth.int * gained);
  statGrowth.vit = Math.floor(growth.vit * gained);
  statGrowth.spd = Math.floor(growth.spd * gained);
  statGrowth.cri = Math.floor(growth.cri * gained);

  return {
    newLevel: level,
    newExp: exp,
    levelsGained: level - currentLevel,
    hpGained,
    nodePointsGained,
    statGrowth,
  };
}
