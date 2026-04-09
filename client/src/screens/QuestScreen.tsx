import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface QuestRow {
  id: number; name: string; description: string; requiredLevel: number;
  targetName: string | null; targetCount: number;
  rewardExp: number; rewardGold: number;
  rewardItemId: number | null; rewardItemQty: number | null;
  rewardItem2Name: string | null; rewardItem2Qty: number | null;
  accepted: boolean; progress: number; completed: boolean; claimed: boolean;
  locked: boolean;
}

export function QuestScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [quests, setQuests] = useState<QuestRow[]>([]);
  const [rewardMsg, setRewardMsg] = useState<string | null>(null);

  async function refresh() {
    if (!active) return;
    const data = await api<QuestRow[]>(`/characters/${active.id}/quests`);
    setQuests(data);
  }
  useEffect(() => { refresh(); }, [active]);

  async function accept(qid: number) {
    if (!active) return;
    await api(`/characters/${active.id}/quests/${qid}/accept`, { method: 'POST' });
    refresh();
  }
  async function claim(qid: number) {
    if (!active) return;
    const res = await api<{ rewardItem: string; rewardGrade: string }>(`/characters/${active.id}/quests/${qid}/claim`, { method: 'POST' });
    setRewardMsg(`보상 수령 완료! (${res.rewardItem})`);
    setTimeout(() => setRewardMsg(null), 4000);
    await refresh();
    await refreshActive();
  }

  const done = quests.filter(q => q.claimed).length;
  const total = quests.length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--accent)' }}>일일 퀘스트</h2>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{done}</span>/{total} 완료 · 매일 자정(KST) 초기화
        </div>
      </div>

      {rewardMsg && (
        <div style={{
          padding: 12, marginBottom: 12, background: 'rgba(107,163,104,0.15)',
          border: '1px solid var(--success)', borderRadius: 6,
          textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--success)',
        }}>
          {rewardMsg}
        </div>
      )}

      {/* 안내 */}
      <div style={{
        padding: 10, marginBottom: 14, fontSize: 12, color: 'var(--text-dim)',
        background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6,
      }}>
        · 모든 퀘스트는 <span style={{ color: 'var(--accent)', fontWeight: 700 }}>24시간마다 초기화</span>되어 매일 다시 도전할 수 있습니다<br/>
        · 보상: <span style={{ color: '#e0a040', fontWeight: 700 }}>골드 + 경험치 + 찢어진 스크롤 ×1</span> + 랜덤 박스<br/>
        · 찢어진 스크롤 100개를 모아 <span style={{ color: '#b060cc', fontWeight: 700 }}>노드 스크롤 +8</span>을 제작할 수 있습니다
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {quests.map((q) => {
          const pctDone = q.targetCount > 0 ? Math.min(100, (q.progress / q.targetCount) * 100) : 0;
          return (
            <div key={q.id} style={{
              padding: 14, background: 'var(--bg-panel)', borderRadius: 6,
              border: `1px solid ${q.claimed ? 'var(--success)' : q.completed ? 'var(--accent)' : 'var(--border)'}`,
              opacity: q.locked ? 0.4 : q.claimed ? 0.6 : 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: q.claimed ? 'var(--success)' : 'var(--accent)', fontSize: 14 }}>
                    {q.name}
                    {q.claimed && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--success)' }}>완료 ✓</span>}
                    {q.completed && !q.claimed && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', animation: 'pulse 0.6s ease-in-out infinite alternate' }}>달성!</span>}
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>{q.description}</div>

                  {/* 진행바 */}
                  {q.accepted && !q.claimed && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>
                        <span>{q.targetName}</span>
                        <span>{q.progress} / {q.targetCount}</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pctDone}%`, height: '100%', background: q.completed ? 'var(--success)' : 'var(--accent)', transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  )}

                  {/* 보상 */}
                  <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11 }}>
                    {q.rewardGold > 0 && <span style={{ color: '#e0a040', fontWeight: 700 }}>{q.rewardGold.toLocaleString()}G</span>}
                    {q.rewardExp > 0 && <span style={{ color: '#8b8bef', fontWeight: 700 }}>EXP +{q.rewardExp.toLocaleString()}</span>}
                    <span style={{ color: '#5b8ecc', fontWeight: 700 }}>찢어진 스크롤 ×1</span>
                    <span style={{ color: 'var(--text-dim)' }}>+ 랜덤 박스</span>
                  </div>

                  {q.locked && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4 }}>Lv.{q.requiredLevel} 이상 필요</div>}
                </div>
                <div style={{ flexShrink: 0 }}>
                  {!q.locked && !q.accepted && <button className="primary" onClick={() => accept(q.id)} style={{ fontSize: 13 }}>수락</button>}
                  {q.completed && !q.claimed && <button className="primary" onClick={() => claim(q.id)} style={{ fontSize: 13, fontWeight: 700 }}>보상 수령</button>}
                  {q.accepted && !q.completed && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>진행 중</span>}
                </div>
              </div>
            </div>
          );
        })}
        {quests.length === 0 && <div style={{ color: 'var(--text-dim)' }}>퀘스트가 없습니다.</div>}
      </div>
    </div>
  );
}
