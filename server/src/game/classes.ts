// 클래스별 시작 스탯 (docs/balance.md 참조)

export type ClassName =
  | 'warrior' | 'swordsman' | 'archer' | 'rogue'
  | 'assassin' | 'mage' | 'priest' | 'druid';

export interface Stats {
  str: number;
  dex: number;
  int: number;
  vit: number;
  spd: number;
  cri: number;
}

interface ClassStart {
  stats: Stats;
  maxHp: number;
  maxMp: number;
}

export const CLASS_START: Record<ClassName, ClassStart> = {
  warrior:   { stats: { str: 14, dex: 8,  int: 4,  vit: 16, spd: 90,  cri: 5  }, maxHp: 160, maxMp: 40  },
  swordsman: { stats: { str: 13, dex: 11, int: 5,  vit: 12, spd: 110, cri: 8  }, maxHp: 130, maxMp: 50  },
  archer:    { stats: { str: 10, dex: 15, int: 6,  vit: 10, spd: 120, cri: 12 }, maxHp: 110, maxMp: 60  },
  rogue:     { stats: { str: 9,  dex: 16, int: 7,  vit: 9,  spd: 140, cri: 14 }, maxHp: 100, maxMp: 60  },
  assassin:  { stats: { str: 12, dex: 14, int: 6,  vit: 8,  spd: 135, cri: 18 }, maxHp: 95,  maxMp: 55  },
  mage:      { stats: { str: 4,  dex: 7,  int: 18, vit: 8,  spd: 100, cri: 6  }, maxHp: 85,  maxMp: 120 },
  priest:    { stats: { str: 6,  dex: 8,  int: 15, vit: 11, spd: 95,  cri: 5  }, maxHp: 110, maxMp: 110 },
  druid:     { stats: { str: 8,  dex: 10, int: 13, vit: 12, spd: 105, cri: 7  }, maxHp: 120, maxMp: 100 },
};

export function getStartingStats(className: ClassName) {
  return CLASS_START[className];
}
