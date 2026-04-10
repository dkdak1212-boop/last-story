// 경험치 / 레벨 관련 — v1.0
// 레벨업 시 maxHp +25, 노드포인트 +1, 스탯포인트 +5 (수동 분배)
// 자동 스탯 성장 제거 — 스탯은 상태창에서 수동으로 찍는다

export const HP_PER_LEVEL = 25;
export const STAT_POINTS_PER_LEVEL = 5;

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

export interface LevelUpResult {
  newLevel: number;
  newExp: number;
  levelsGained: number;
  hpGained: number;          // HP_PER_LEVEL per level
  nodePointsGained: number;  // +1 per level
  statPointsGained: number;  // STAT_POINTS_PER_LEVEL per level
}

export function applyExpGain(
  currentLevel: number,
  currentExp: number,
  expGained: number,
  _className: string = 'warrior'
): LevelUpResult {
  let level = currentLevel;
  let exp = currentExp + expGained;
  let hpGained = 0;
  let nodePointsGained = 0;
  let statPointsGained = 0;

  while (level < 100 && exp >= expToNext(level)) {
    exp -= expToNext(level);
    level += 1;
    hpGained += HP_PER_LEVEL;
    nodePointsGained += 1;
    statPointsGained += STAT_POINTS_PER_LEVEL;
  }

  return {
    newLevel: level,
    newExp: exp,
    levelsGained: level - currentLevel,
    hpGained,
    nodePointsGained,
    statPointsGained,
  };
}
