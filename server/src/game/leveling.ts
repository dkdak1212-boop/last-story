// 경험치 / 레벨 관련 — v1.0
// 레벨업 시 maxHp +25, 노드포인트 +1, 스탯포인트 +5 (수동 분배)
// 자동 스탯 성장 제거 — 스탯은 상태창에서 수동으로 찍는다

export const HP_PER_LEVEL = 25;
export const STAT_POINTS_PER_LEVEL = 2;

export function expToNext(level: number): number {
  if (level <= 30) {
    return Math.floor(120 * level * Math.pow(level, 0.8));
  } else if (level <= 60) {
    return Math.floor(400 * level * Math.pow(level, 1.1));
  } else if (level < 90) {
    const base60 = 600 * 60 * Math.pow(60, 1.1);
    const scale = Math.pow((level - 60) / 8 + 1, 2.5);
    return Math.floor(base60 * scale);
  } else {
    // 90~100: 기존 공식의 15배
    const base60 = 600 * 60 * Math.pow(60, 1.1);
    const scale = Math.pow((level - 60) / 8 + 1, 2.5);
    return Math.floor(base60 * scale * 15);
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
  _className: string = 'warrior',
  maxLevelCap: number = 100,
): LevelUpResult {
  let level = currentLevel;
  let exp = currentExp + expGained;
  let hpGained = 0;
  let nodePointsGained = 0;
  let statPointsGained = 0;

  // maxLevelCap: 일반 사냥은 100, 오프라인 정산의 신규 이벤트 캐릭은 95(이벤트 max_level)
  // cap 도달 시 잔여 EXP 버림 (cap 레벨에서 멈춤).
  while (level < maxLevelCap && exp >= expToNext(level)) {
    exp -= expToNext(level);
    level += 1;
    hpGained += HP_PER_LEVEL;
    nodePointsGained += 1;
    statPointsGained += STAT_POINTS_PER_LEVEL;
  }
  if (level >= maxLevelCap) exp = 0; // cap 시 exp 0 으로 잘라

  return {
    newLevel: level,
    newExp: exp,
    levelsGained: level - currentLevel,
    hpGained,
    nodePointsGained,
    statPointsGained,
  };
}
