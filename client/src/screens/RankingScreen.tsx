import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface RankEntry {
  rank: number; id: number; name: string; className: string;
  level: number; gold: number; exp: number;
}

const CLASS_LABEL: Record<string, string> = {
  warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적',
};

export function RankingScreen() {
  const [type, setType] = useState<'level' | 'gold'>('level');
  const [rows, setRows] = useState<RankEntry[]>([]);

  useEffect(() => {
    api<RankEntry[]>(`/ranking?type=${type}`).then(setRows).catch(() => {});
  }, [type]);

  return (
    <div>
      <h2 style={{ marginBottom: 16, color: 'var(--accent)' }}>랭킹</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={type === 'level' ? 'primary' : ''} onClick={() => setType('level')}>레벨</button>
        <button className={type === 'gold' ? 'primary' : ''} onClick={() => setType('gold')}>골드</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((r) => (
          <div key={r.id} className="ranking-row" style={{
            padding: '10px 14px', background: 'var(--bg-panel)', border: '1px solid var(--border)',
            display: 'flex', gap: 14, alignItems: 'center',
          }}>
            <div style={{ width: 36, color: r.rank <= 3 ? 'var(--accent)' : 'var(--text-dim)', fontWeight: 700 }}>
              #{r.rank}
            </div>
            <div style={{ flex: 1, fontWeight: 700 }}>{r.name}</div>
            <div className="rank-class" style={{ width: 70, color: 'var(--text-dim)', fontSize: 13 }}>{CLASS_LABEL[r.className] || r.className}</div>
            <div style={{ width: 80, textAlign: 'right' }}>Lv.{r.level}</div>
            <div className="rank-gold" style={{ width: 100, textAlign: 'right', color: 'var(--accent)' }}>{r.gold.toLocaleString()}G</div>
          </div>
        ))}
        {rows.length === 0 && <div style={{ color: 'var(--text-dim)' }}>랭킹 데이터 없음</div>}
      </div>
    </div>
  );
}
