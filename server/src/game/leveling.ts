// 경험치 / 레벨 관련 — v0.9
// 레벨업 시 스탯 성장 없음, 노드 포인트 +2, maxHp +5

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

export interface LevelUpResult {
  newLevel: number;
  newExp: number;
  levelsGained: number;
  hpGained: number;        // +5 per level
  nodePointsGained: number; // +2 per level
}

export function applyExpGain(
  currentLevel: number,
  currentExp: number,
  expGained: number
): LevelUpResult {
  let level = currentLevel;
  let exp = currentExp + expGained;
  let hpGained = 0;
  let nodePointsGained = 0;

  while (level < 100 && exp >= expToNext(level)) {
    exp -= expToNext(level);
    level += 1;
    hpGained += 5;
    nodePointsGained += 2;
  }

  return {
    newLevel: level,
    newExp: exp,
    levelsGained: level - currentLevel,
    hpGained,
    nodePointsGained,
  };
}
