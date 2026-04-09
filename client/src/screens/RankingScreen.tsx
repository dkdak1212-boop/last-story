import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface RankEntry {
  rank: number; id: number; name: string; className: string;
  level: number; value: number; label: string; extra?: string;
}

const CLASS_LABEL: Record<string, string> = {
  warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적',
};
const CLASS_COLOR: Record<string, string> = {
  warrior: '#e04040', mage: '#6688ff', cleric: '#ffcc44', rogue: '#aa66cc',
};

const TABS: { key: string; label: string }[] = [
  { key: 'level', label: '레벨' },
  { key: 'gold', label: '골드' },
  { key: 'pvp', label: 'PvP' },
  { key: 'enhance', label: '강화' },
];

function medalColor(rank: number): string | null {
  if (rank === 1) return '#ffd700';
  if (rank === 2) return '#c0c0c0';
  if (rank === 3) return '#cd7f32';
  return null;
}

export function RankingScreen() {
  const [type, setType] = useState('level');
  const [rows, setRows] = useState<RankEntry[]>([]);

  useEffect(() => {
    api<RankEntry[]>(`/ranking?type=${type}`).then(setRows).catch(() => {});
  }, [type]);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 12, color: 'var(--accent)' }}>랭킹 TOP 100</h2>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '2px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setType(t.key)} style={{
            flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 700,
            border: 'none', cursor: 'pointer',
            background: type === t.key ? 'var(--bg-panel)' : 'transparent',
            color: type === t.key ? 'var(--accent)' : 'var(--text-dim)',
            borderBottom: type === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -2,
          }}>{t.label}</button>
        ))}
      </div>

      {/* 랭킹 리스트 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.length === 0 && <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 20 }}>데이터 없음</div>}
        {rows.map(r => {
          const medal = medalColor(r.rank);
          return (
            <div key={`${r.id}-${r.rank}`} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', borderRadius: 4,
              background: medal ? `${medal}08` : 'var(--bg-panel)',
              borderLeft: medal ? `3px solid ${medal}` : '3px solid transparent',
            }}>
              {/* 순위 */}
              <div style={{
                width: 28, textAlign: 'center', fontWeight: 900, fontSize: medal ? 15 : 12,
                color: medal || 'var(--text-dim)',
              }}>
                {r.rank <= 3 ? ['', '1st', '2nd', '3rd'][r.rank] : r.rank}
              </div>

              {/* 이름 + 직업 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</div>
                <div style={{ fontSize: 10, color: CLASS_COLOR[r.className] || 'var(--text-dim)' }}>
                  {CLASS_LABEL[r.className] || r.className} · Lv.{r.level}
                </div>
              </div>

              {/* 부가 정보 */}
              {r.extra && (
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'right' }}>
                  {r.extra}
                </div>
              )}

              {/* 메인 수치 */}
              <div style={{
                fontWeight: 700, fontSize: 14, color: 'var(--accent)',
                minWidth: 70, textAlign: 'right',
              }}>
                {r.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
