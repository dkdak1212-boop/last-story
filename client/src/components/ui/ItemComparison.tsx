import type { Stats } from '../../types';
import { STAT_LABEL, getEnhanceMult } from './ItemStats';

const STAT_ORDER: (keyof Stats)[] = ['str', 'dex', 'int', 'vit', 'spd', 'cri'];

interface Props {
  itemStats: Partial<Stats> | null | undefined;
  equippedStats: Partial<Stats> | null | undefined;
  itemEnhance?: number;
  equippedEnhance?: number;
}

export function ItemComparison({ itemStats, equippedStats, itemEnhance = 0, equippedEnhance = 0 }: Props) {
  const diffs: { key: keyof Stats; diff: number }[] = [];
  const multA = getEnhanceMult(itemEnhance);
  const multB = getEnhanceMult(equippedEnhance);

  for (const k of STAT_ORDER) {
    const a = Math.round(((itemStats as Record<string, number> | null)?.[k] ?? 0) * multA);
    const b = Math.round(((equippedStats as Record<string, number> | null)?.[k] ?? 0) * multB);
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
