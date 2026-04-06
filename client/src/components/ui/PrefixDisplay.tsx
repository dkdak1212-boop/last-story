// 아이템 접두사 보너스 스탯 표시
import { STAT_LABEL } from './ItemStats';

const EXTRA_LABELS: Record<string, string> = {
  dodge: '회피',
  accuracy: '명중',
};

interface Props {
  prefixStats: Record<string, number> | undefined | null;
}

export function PrefixDisplay({ prefixStats }: Props) {
  if (!prefixStats || Object.keys(prefixStats).length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', fontSize: 11, marginTop: 3 }}>
      {Object.entries(prefixStats).map(([key, val]) => {
        const label = (STAT_LABEL as Record<string, string>)[key] ?? EXTRA_LABELS[key] ?? key;
        return (
          <span key={key} style={{ color: '#e0a040', fontWeight: 700 }}>
            {label} +{val}
          </span>
        );
      })}
    </div>
  );
}
