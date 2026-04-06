// 경험치 / 레벨 관련

export function expToNext(level: number): number {
  if (level <= 30) {
    // 1~30: 빠른 성장 (레벨당 1~7분)
    return Math.floor(50 * level * Math.pow(level, 0.6));
  } else if (level <= 60) {
    // 31~60: 느린 성장 (레벨당 15~40분)
    return Math.floor(80 * level * Math.pow(level, 1.0));
  } else {
    // 61~100: 엄청 느린 성장 (레벨당 1~4시간)
    // Lv.60 기준값에서 부드럽게 연결 + 가파른 곡선
    const base60 = 80 * 60 * 60; // 288,000
    const scale = Math.pow((level - 60) / 10 + 1, 2.2);
    return Math.floor(base60 * scale);
  }
}

// 레벨업 스탯 증가 (클래스별)
export const GROWTH: Record<string, { str: number; dex: number; int: number; vit: number; spd: number; cri: number; hp: number; mp: number }> = {
  warrior:   { str: 2,   dex: 1,   int: 0, vit: 2,   spd: 0.5, cri: 0.1, hp: 16, mp: 5 },
  swordsman: { str: 2,   dex: 1.5, int: 0, vit: 1,   spd: 1,   cri: 0.2, hp: 13, mp: 6 },
  archer:    { str: 1,   dex: 2,   int: 0, vit: 1,   spd: 1.5, cri: 0.3, hp: 13, mp: 6 },
  rogue:     { str: 1,   dex: 2,   int: 0, vit: 1,   spd: 2,   cri: 0.4, hp: 13, mp: 7 },
  assassin:  { str: 1.5, dex: 2,   int: 0, vit: 0.5, spd: 1.5, cri: 0.5, hp: 11, mp: 6 },
  mage:      { str: 0,   dex: 0.5, int: 3, vit: 1,   spd: 0.5, cri: 0.1, hp: 13, mp: 11 },
  priest:    { str: 0.5, dex: 0.5, int: 2.5, vit: 1.5, spd: 0.5, cri: 0.1, hp: 14, mp: 10 },
  druid:     { str: 1,   dex: 1,   int: 2, vit: 1.5, spd: 0.5, cri: 0.2, hp: 14, mp: 9 },
};

export interface LevelUpResult {
  newLevel: number;
  newExp: number;
  levelsGained: number;
  statGains: { str: number; dex: number; int: number; vit: number; spd: number; cri: number; hp: number; mp: number };
}

export function applyExpGain(
  className: string,
  currentLevel: number,
  currentExp: number,
  expGained: number
): LevelUpResult {
  let level = currentLevel;
  let exp = currentExp + expGained;
  const g = GROWTH[className] || GROWTH.warrior;
  const totalGains = { str: 0, dex: 0, int: 0, vit: 0, spd: 0, cri: 0, hp: 0, mp: 0 };

  while (exp >= expToNext(level)) {
    exp -= expToNext(level);
    level += 1;
    totalGains.str += g.str;
    totalGains.dex += g.dex;
    totalGains.int += g.int;
    totalGains.vit += g.vit;
    totalGains.spd += g.spd;
    totalGains.cri += g.cri;
    totalGains.hp += g.hp;
    totalGains.mp += g.mp;
  }

  return {
    newLevel: level,
    newExp: exp,
    levelsGained: level - currentLevel,
    statGains: {
      str: Math.round(totalGains.str),
      dex: Math.round(totalGains.dex),
      int: Math.round(totalGains.int),
      vit: Math.round(totalGains.vit),
      spd: Math.round(totalGains.spd),
      cri: Math.round(totalGains.cri * 10) / 10,
      hp: totalGains.hp,
      mp: totalGains.mp,
    },
  };
}
