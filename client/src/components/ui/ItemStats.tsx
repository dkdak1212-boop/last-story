import type { ItemGrade, Stats } from '../../types';

export const GRADE_COLOR: Record<ItemGrade, string> = {
  common: 'var(--grade-common)',
  rare: 'var(--grade-rare)',
  epic: 'var(--grade-epic)',
  legendary: 'var(--grade-legendary)',
  unique: '#ff8c2a',
};

export const GRADE_LABEL: Record<ItemGrade, string> = {
  common: '일반',
  rare: '희귀',
  epic: '영웅',
  legendary: '전설',
  unique: '유니크',
};

export const STAT_LABEL: Record<string, string> = {
  str: '힘',
  dex: '민첩',
  int: '지능',
  vit: '체력',
  spd: '스피드',
  cri: '치명타 확률',
  atk: '물리 공격',
  matk: '마법 공격',
  def: '방어력',
  mdef: '마법 방어',
  hp: 'HP',
  accuracy: '명중',
  dodge: '회피',
  def_reduce_pct: '약화',
  slow_pct: '저주',
  dot_amp_pct: '확산',
  hp_regen: '재생',
  lifesteal_pct: '흡혈',
  gold_bonus_pct: '황금',
  exp_bonus_pct: '경험',
  crit_dmg_pct: '날카로움',
};

const STAT_ORDER: string[] = ['atk', 'matk', 'def', 'mdef', 'hp', 'str', 'dex', 'int', 'vit', 'spd', 'cri'];

// % 단위 접두사
const PCT_STATS = new Set(['def_reduce_pct', 'slow_pct', 'dot_amp_pct', 'gold_bonus_pct', 'exp_bonus_pct', 'crit_dmg_pct', 'cri']);
// 특수: lifesteal_pct는 값/10 → % (5→0.5%)
const LIFESTEAL_KEY = 'lifesteal_pct';

export function formatPrefixValue(key: string, value: number): string {
  if (key === LIFESTEAL_KEY) return `+${(value / 10).toFixed(1)}%`;
  if (PCT_STATS.has(key)) return `+${value}%`;
  return `+${value}`;
}

// 강화 배율 계산 (EnhanceScreen과 동일): +5%/단계
export function getEnhanceMult(el: number): number {
  if (el <= 0) return 1;
  return 1 + el * 0.05;
}

// 스탯 jsonb → 라인 배열 (강화 배율 + 품질 보너스 덧셈)
export function formatStats(stats: Record<string, number> | null | undefined, enhanceLevel = 0, quality = 0): string[] {
  if (!stats) return [];
  const enhMult = getEnhanceMult(enhanceLevel);
  const qualBonus = (quality || 0) / 100;
  const mult = enhMult + qualBonus;
  const lines: string[] = [];
  for (const key of STAT_ORDER) {
    const v = (stats as any)[key];
    if (v) {
      const value = Math.round(v * mult);
      const suffix = PCT_STATS.has(key) ? '%' : '';
      lines.push(`${STAT_LABEL[key] || key} +${value}${suffix}`);
    }
  }
  return lines;
}

// 인라인 스탯 표시 (한 줄)
export function ItemStatsInline({ stats, enhanceLevel = 0, quality = 0 }: { stats: Partial<Stats> | null | undefined; enhanceLevel?: number; quality?: number }) {
  const lines = formatStats(stats, enhanceLevel, quality);
  if (lines.length === 0) return null;
  return (
    <span style={{ fontSize: 11, color: 'var(--success)' }}>
      {lines.join(' · ')}
    </span>
  );
}

// 블록형 스탯 표시 (여러 줄)
export function ItemStatsBlock({ stats, enhanceLevel = 0, quality = 0 }: { stats: Partial<Stats> | null | undefined; enhanceLevel?: number; quality?: number }) {
  const lines = formatStats(stats, enhanceLevel, quality);
  if (lines.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: 'var(--success)' }}>
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}
