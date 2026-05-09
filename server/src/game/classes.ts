// 4직업 시작 스탯 — v0.9 / archer 공개(2026-05-10 09:00 KST) / summoner v2 개편 통합

export type ClassName = 'warrior' | 'mage' | 'cleric' | 'rogue' | 'summoner' | 'archer';

// 어드민 전용 직업 — `/characters/create` 에서 별도 검증, 클라에서 hide.
// 2026-05-10: archer 제거 (시간 게이트로 분리, 아래 ARCHER_PUBLIC_RELEASE_MS 사용).
export const ADMIN_ONLY_CLASSES: Set<ClassName> = new Set();

// 궁수 일반 공개 시각 — KST 2026-05-10 09:00. 이전엔 어드민만 생성 가능.
export const ARCHER_PUBLIC_RELEASE_MS = new Date('2026-05-10T09:00:00+09:00').getTime();

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
  // 소환사 (개편 v2) — 한 마리 소환수를 4방향(신수/정령/괴수/마도) 으로 변환·강화하는 술자
  summoner: {
    stats: { str: 4,  dex: 6,  int: 18, vit: 14, spd: 200, cri: 5 },
    maxHp: 200,
    description: '소환수 1체를 신수·정령·괴수·마도로 변환·강화',
  },
  // 1차 어드민 전용 — DEX 주력, cri 베이스 강화 (25), 가상 사거리 stack 시스템.
  archer: {
    stats: { str: 6,  dex: 18, int: 5,  vit: 14, spd: 200, cri: 25 },
    maxHp: 200,
    description: '카이팅 저격수 — 처치 누적으로 사거리 강화',
  },
};

export function getStartingStats(className: ClassName) {
  return CLASS_START[className];
}
