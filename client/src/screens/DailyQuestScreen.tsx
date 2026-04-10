import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface DailyQuest {
  id: number; label: string; kind: string; target: number; progress: number; completed: boolean;
}
interface DailyStatus {
  quests: DailyQuest[]; allCompleted: boolean; rewardClaimed: boolean;
}

export function DailyQuestScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [msg, setMsg] = useState('');
  const [claiming, setClaiming] = useState(false);

  async function load() {
    if (!active) return;
    const d = await api<DailyStatus>(`/characters/${active.id}/daily-quests`);
    setStatus(d);
  }
  useEffect(() => { load(); }, [active?.id]);

  async function claim() {
    if (!active || claiming) return;
    setClaiming(true); setMsg('');
    try {
      const r = await api<{ exp: number; scrollId: number; scrollQty: number }>(
        `/characters/${active.id}/daily-quests/claim`, { method: 'POST' }
      );
      setMsg(`보상 수령! EXP +${r.exp.toLocaleString()}, 찢어진 스크롤 x${r.scrollQty}`);
      await load();
      await refreshActive();
    } catch (e) { setMsg(e instanceof Error ? e.message : '수령 실패'); }
    setClaiming(false);
  }

  if (!status) return <div style={{ color: 'var(--text-dim)' }}>로딩...</div>;

  const completedCount = status.quests.filter(q => q.completed).length;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ color: 'var(--accent)', margin: 0 }}>일일 임무</h2>
        <span style={{ fontSize: 13, color: completedCount === 3 ? 'var(--success)' : 'var(--text-dim)', fontWeight: 700 }}>
          {completedCount}/3 완료
        </span>
      </div>

      {msg && (
        <div style={{
          padding: '8px 12px', marginBottom: 10, fontSize: 12, fontWeight: 700, borderRadius: 4,
          background: msg.includes('보상') ? 'rgba(76,175,80,0.1)' : 'rgba(200,60,60,0.1)',
          color: msg.includes('보상') ? 'var(--success)' : 'var(--danger)',
          border: `1px solid ${msg.includes('보상') ? 'rgba(76,175,80,0.3)' : 'rgba(200,60,60,0.3)'}`,
        }}>{msg}</div>
      )}

      {/* 퀘스트 카드 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {status.quests.map(q => {
          const pct = Math.min(100, (q.progress / q.target) * 100);
          return (
            <div key={q.id} style={{
              padding: 14, borderRadius: 6, background: 'var(--bg-panel)',
              border: `1px solid ${q.completed ? 'var(--success)' : 'var(--border)'}`,
              opacity: q.completed ? 0.7 : 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: q.completed ? 'var(--success)' : 'var(--text)' }}>
                  {q.label}
                </span>
                {q.completed && <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 700 }}>완료</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: q.completed ? 'var(--success)' : 'var(--accent)',
                    borderRadius: 4, transition: 'width 0.3s',
                  }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', minWidth: 60, textAlign: 'right' }}>
                  {q.progress}/{q.target}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 보상 */}
      <div style={{
        padding: 14, borderRadius: 6,
        background: status.allCompleted ? 'rgba(218,165,32,0.08)' : 'var(--bg-panel)',
        border: `1px solid ${status.allCompleted ? 'var(--accent)' : 'var(--border)'}`,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>임무 완료 보상 (하루 1회)</div>
        <div style={{ fontSize: 12, marginBottom: 8, lineHeight: 1.8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#8b8bef' }}>경험치</span>
            <span style={{ color: '#8b8bef', fontWeight: 700 }}>레벨 x 500 EXP</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--accent)' }}>찢어진 스크롤</span>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>x 1</span>
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>매일 자정(KST) 초기화</div>
        {status.rewardClaimed ? (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 700 }}>오늘 보상을 수령했습니다</div>
        ) : status.allCompleted ? (
          <button onClick={claim} disabled={claiming} style={{
            width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 700,
            background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer',
          }}>
            {claiming ? '수령 중...' : '보상 수령'}
          </button>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>모든 임무를 완료하면 수령 가능</div>
        )}
      </div>
    </div>
  );
}
