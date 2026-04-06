import type { ItemGrade, Stats } from '../../types';

export const GRADE_COLOR: Record<ItemGrade, string> = {
  common: 'var(--grade-common)',
  rare: 'var(--grade-rare)',
  epic: 'var(--grade-epic)',
  legendary: 'var(--grade-legendary)',
};

export const GRADE_LABEL: Record<ItemGrade, string> = {
  common: '일반',
  rare: '희귀',
  epic: '영웅',
  legendary: '전설',
};

export const STAT_LABEL: Record<keyof Stats, string> = {
  str: '힘',
  dex: '민첩',
  int: '지능',
  vit: '체력',
  spd: '스피드',
  cri: '치명타',
};

const STAT_ORDER: (keyof Stats)[] = ['str', 'dex', 'int', 'vit', 'spd', 'cri'];

// 스탯 jsonb → 라인 배열
export function formatStats(stats: Partial<Stats> | null | undefined): string[] {
  if (!stats) return [];
  const lines: string[] = [];
  for (const key of STAT_ORDER) {
    const v = stats[key];
    if (v) lines.push(`${STAT_LABEL[key]} +${v}`);
  }
  return lines;
}

// 인라인 스탯 표시 (한 줄)
export function ItemStatsInline({ stats }: { stats: Partial<Stats> | null | undefined }) {
  const lines = formatStats(stats);
  if (lines.length === 0) return null;
  return (
    <span style={{ fontSize: 11, color: 'var(--success)' }}>
      {lines.join(' · ')}
    </span>
  );
}

// 블록형 스탯 표시 (여러 줄)
export function ItemStatsBlock({ stats }: { stats: Partial<Stats> | null | undefined }) {
  const lines = formatStats(stats);
  if (lines.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: 'var(--success)' }}>
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}
