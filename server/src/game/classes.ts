// 4직업 시작 스탯 — v0.9

export type ClassName = 'warrior' | 'mage' | 'cleric' | 'rogue' | 'summoner';

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
  description: string;
}

// 공통 고정 스탯: HP 200, VIT 14, SPD 200, CRI 5
// 차별 스탯: STR / DEX / INT
export const CLASS_START: Record<ClassName, ClassStart> = {
  warrior: {
    stats: { str: 15, dex: 8,  int: 4,  vit: 14, spd: 200, cri: 5 },
    maxHp: 200,
    description: '압도적 물리, 흡혈 지속전투',
  },
  mage: {
    stats: { str: 4,  dex: 7,  int: 16, vit: 14, spd: 200, cri: 5 },
    maxHp: 200,
    description: '원소 파괴 + 게이지 조작 제어',
  },
  cleric: {
    stats: { str: 8,  dex: 6,  int: 16, vit: 14, spd: 200, cri: 5 },
    maxHp: 200,
    description: '보조/공격 양면, 신성 실드와 심판',
  },
  rogue: {
    stats: { str: 10, dex: 14, int: 5,  vit: 14, spd: 200, cri: 5 },
    maxHp: 200,
    description: '스피드와 제어, 독 스택 연속행동',
  },
  summoner: {
    stats: { str: 4,  dex: 6,  int: 18, vit: 14, spd: 200, cri: 5 },
    maxHp: 200,
    description: '소환수가 대신 싸우는 군주, INT 특화',
  },
};

export function getStartingStats(className: ClassName) {
  return CLASS_START[className];
}
