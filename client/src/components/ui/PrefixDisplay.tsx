// 아이템 접두사 보너스 스탯 표시
import { STAT_LABEL, formatPrefixValue } from './ItemStats';

interface Props {
  prefixStats: Record<string, number> | undefined | null;
}

export function PrefixDisplay({ prefixStats }: Props) {
  if (!prefixStats || Object.keys(prefixStats).length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', fontSize: 11, marginTop: 3 }}>
      {Object.entries(prefixStats).map(([key, val]) => {
        const label = (STAT_LABEL as Record<string, string>)[key] ?? key;
        return (
          <span key={key} style={{ color: '#e0a040', fontWeight: 700 }}>
            {label} {formatPrefixValue(key, val)}
          </span>
        );
      })}
    </div>
  );
}
