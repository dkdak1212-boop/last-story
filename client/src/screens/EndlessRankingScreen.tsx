import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface RankRow {
  rank: number;
  characterId: number;
  name: string;
  className: string;
  level: number;
  guildName: string | null;
  floor: number;
  reachedAt?: string;
}

interface MyRank {
  dailyRank: number | null;
  dailyFloor?: number;
  allTimeRank: number | null;
  allTimeFloor?: number;
}

const CLASS_LABEL: Record<string, string> = {
  warrior: '전사', mage: '마법사', rogue: '도적', cleric: '성직자', summoner: '소환사',
};

export function EndlessRankingScreen() {
  const nav = useNavigate();
  const active = useCharacterStore((s) => s.activeCharacter);
  const [tab, setTab] = useState<'daily' | 'all-time'>('daily');
  const [rows, setRows] = useState<RankRow[]>([]);
  const [myRank, setMyRank] = useState<MyRank | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setErr(null);
    api<{ rankings: RankRow[] }>(`/endless/ranking/${tab}`)
      .then(d => { if (!cancel) setRows(d.rankings || []); })
      .catch(e => { if (!cancel) setErr(e instanceof Error ? e.message : '로드 실패'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [tab]);

  useEffect(() => {
    if (!active) return;
    let cancel = false;
    api<MyRank>(`/endless/${active.id}/my-rank`)
      .then(d => { if (!cancel) setMyRank(d); })
      .catch(() => {});
    return () => { cancel = true; };
  }, [active, tab]);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h2 style={{ margin: 0, color: '#c97bff' }}>종언의 기둥 — 랭킹</h2>
        <button onClick={() => nav('/village')} style={{
          padding: '6px 14px', background: 'transparent', color: 'var(--text-dim)',
          border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 4,
        }}>
          마을로
        </button>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
        {([
          { key: 'daily', label: '일일 랭킹' },
          { key: 'all-time', label: '명예의 전당' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 18px', fontSize: 13, fontWeight: 700,
            background: tab === t.key ? 'rgba(162,75,255,0.15)' : 'transparent',
            color: tab === t.key ? '#c97bff' : 'var(--text-dim)',
            border: 'none',
            borderBottom: tab === t.key ? '2px solid #c97bff' : '2px solid transparent',
            cursor: 'pointer',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 자기 순위 */}
      {myRank && (tab === 'daily' ? myRank.dailyRank : myRank.allTimeRank) !== null && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: 'rgba(162,75,255,0.08)', border: '1px solid rgba(162,75,255,0.4)',
          borderRadius: 4, fontSize: 13,
        }}>
          내 순위: <b style={{ color: '#c97bff' }}>
            {tab === 'daily' ? myRank.dailyRank : myRank.allTimeRank}위
          </b>
          {' · '}
          도달층: <b style={{ color: '#ffcc66' }}>
            {tab === 'daily' ? (myRank.dailyFloor ?? 0) : (myRank.allTimeFloor ?? 0)}층
          </b>
        </div>
      )}

      {err && <div style={{ color: 'var(--danger)', marginBottom: 10 }}>{err}</div>}
      {loading && <div style={{ color: 'var(--text-dim)' }}>불러오는 중…</div>}

      {/* 랭킹 표 */}
      {!loading && rows.length === 0 && (
        <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 40 }}>
          {tab === 'daily' ? '오늘 도달 기록이 없습니다.' : '아직 명예의 전당에 등재된 도전자가 없습니다.'}
        </div>
      )}
      {!loading && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* 헤더 */}
          <div style={{
            display: 'grid', gridTemplateColumns: '50px 1fr 80px 90px 80px',
            padding: '8px 12px', fontSize: 11, color: 'var(--text-dim)',
            background: 'var(--bg-panel)', fontWeight: 700,
          }}>
            <div>순위</div>
            <div>닉네임</div>
            <div>클래스</div>
            <div>길드</div>
            <div style={{ textAlign: 'right' }}>도달층</div>
          </div>
          {rows.map(r => {
            const isMe = active?.id === r.characterId;
            const top3 = r.rank <= 3;
            const top10 = r.rank <= 10;
            const top100 = r.rank <= 100;
            const rankColor = top3 ? '#ffcc33' : top10 ? '#daa520' : top100 ? '#c97bff' : '#888';
            return (
              <div key={`${r.rank}-${r.characterId}`} style={{
                display: 'grid', gridTemplateColumns: '50px 1fr 80px 90px 80px',
                padding: '10px 12px', fontSize: 12,
                background: isMe ? 'rgba(162,75,255,0.18)' : 'var(--bg-panel)',
                border: isMe ? '1px solid rgba(162,75,255,0.6)' : '1px solid transparent',
                borderRadius: 3,
              }}>
                <div style={{ fontWeight: 800, color: rankColor }}>{r.rank}</div>
                <div style={{ color: isMe ? '#c97bff' : 'var(--text)', fontWeight: isMe ? 700 : 400 }}>
                  {r.name} <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>Lv.{r.level}</span>
                </div>
                <div style={{ color: 'var(--text-dim)' }}>{CLASS_LABEL[r.className] || r.className}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.guildName || '—'}
                </div>
                <div style={{ textAlign: 'right', fontWeight: 700, color: top10 ? '#ffcc66' : '#fff' }}>
                  {r.floor.toLocaleString()}층
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
