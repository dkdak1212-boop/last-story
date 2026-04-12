import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface RankEntry {
  rank: number; id: number; name: string; className: string;
  level: number; value: number; label: string; extra?: string;
}

const CLASS_LABEL: Record<string, string> = {
  warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적', summoner: '소환사',
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

const CLASS_TABS: { key: string; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'warrior', label: '전사' },
  { key: 'mage', label: '마법사' },
  { key: 'cleric', label: '성직자' },
  { key: 'rogue', label: '도적' },
];

export function RankingScreen() {
  const [type, setType] = useState('level');
  const [classFilter, setClassFilter] = useState('all');
  const [rows, setRows] = useState<RankEntry[]>([]);

  useEffect(() => {
    api<RankEntry[]>(`/ranking?type=${type}`).then(setRows).catch(() => {});
  }, [type]);

  // 클래스 필터 적용 + 재순위 매기기
  const filtered = classFilter === 'all'
    ? rows
    : rows.filter(r => r.className === classFilter).map((r, i) => ({ ...r, rank: i + 1 }));

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 12, color: 'var(--accent)' }}>랭킹 TOP 100</h2>

      {/* 지표 탭 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 8, borderBottom: '2px solid var(--border)' }}>
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

      {/* 직업 필터 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {CLASS_TABS.map(c => {
          const active = classFilter === c.key;
          const color = c.key === 'all' ? 'var(--accent)' : (CLASS_COLOR[c.key] || 'var(--accent)');
          return (
            <button key={c.key} onClick={() => setClassFilter(c.key)} style={{
              padding: '5px 12px', fontSize: 11, fontWeight: 700,
              background: active ? color : 'transparent',
              color: active ? '#000' : color,
              border: `1px solid ${color}`,
              borderRadius: 3, cursor: 'pointer',
            }}>{c.label}</button>
          );
        })}
      </div>

      {/* 랭킹 리스트 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {filtered.length === 0 && <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 20 }}>데이터 없음</div>}
        {filtered.map(r => {
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
