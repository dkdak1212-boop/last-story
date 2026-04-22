import type { Stats } from '../../types';
import { STAT_LABEL, getEnhanceMult } from './ItemStats';

// 주요 장비 스탯 전체 — atk/matk/def/mdef/hp 까지 포함해야 "내 장착 대비 딜·탱 diff" 체감됨
const STAT_ORDER: string[] = ['atk', 'matk', 'def', 'mdef', 'hp', 'str', 'dex', 'int', 'vit', 'spd', 'cri'];

interface Props {
  itemStats: Partial<Stats> | null | undefined;
  equippedStats: Partial<Stats> | null | undefined;
  itemEnhance?: number;
  equippedEnhance?: number;
  itemQuality?: number;
  equippedQuality?: number;
}

export function ItemComparison({ itemStats, equippedStats, itemEnhance = 0, equippedEnhance = 0, itemQuality = 0, equippedQuality = 0 }: Props) {
  const diffs: { key: string; diff: number }[] = [];
  const multA = getEnhanceMult(itemEnhance) + itemQuality / 100;
  const multB = getEnhanceMult(equippedEnhance) + equippedQuality / 100;

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
          {STAT_LABEL[key] || key} {diff > 0 ? `+${diff}` : diff}{diff > 0 ? '▲' : '▼'}
        </span>
      ))}
    </div>
  );
}
