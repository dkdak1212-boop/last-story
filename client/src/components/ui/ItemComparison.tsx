import type { Stats } from '../../types';
import { STAT_LABEL } from './ItemStats';

const STAT_ORDER: (keyof Stats)[] = ['str', 'dex', 'int', 'vit', 'spd', 'cri'];

interface Props {
  itemStats: Partial<Stats> | null | undefined;
  equippedStats: Partial<Stats> | null | undefined;
}

export function ItemComparison({ itemStats, equippedStats }: Props) {
  const diffs: { key: keyof Stats; diff: number }[] = [];

  for (const k of STAT_ORDER) {
    const a = (itemStats as Record<string, number> | null)?.[k] ?? 0;
    const b = (equippedStats as Record<string, number> | null)?.[k] ?? 0;
    const diff = a - b;
    if (diff !== 0) diffs.push({ key: k, diff });
  }

  if (diffs.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', fontSize: 11, marginTop: 4 }}>
      {diffs.map(({ key, diff }) => (
        <span key={key} style={{ color: diff > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
          {STAT_LABEL[key]} {diff > 0 ? `+${diff}` : diff}{diff > 0 ? '▲' : '▼'}
        </span>
      ))}
    </div>
  );
}
