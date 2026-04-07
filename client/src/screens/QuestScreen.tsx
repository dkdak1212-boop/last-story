import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface QuestRow {
  id: number; name: string; description: string; requiredLevel: number;
  targetName: string | null; targetCount: number;
  rewardExp: number; rewardGold: number;
  rewardItemId: number | null; rewardItemQty: number | null;
  accepted: boolean; progress: number; completed: boolean; claimed: boolean;
  locked: boolean;
}

const GRADE_COLORS: Record<string, string> = {
  common: '#aaa', rare: '#4488ff', epic: '#aa44ff', legendary: '#ff8800',
};

export function QuestScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [quests, setQuests] = useState<QuestRow[]>([]);
  const [rewardMsg, setRewardMsg] = useState<{ item: string; grade: string } | null>(null);

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
    setRewardMsg({ item: res.rewardItem, grade: res.rewardGrade });
    setTimeout(() => setRewardMsg(null), 5000);
    await refresh();
    await refreshActive();
  }

  return (
    <div>
      <h2 style={{ marginBottom: 20, color: 'var(--accent)' }}>퀘스트</h2>
      {rewardMsg && (
        <div style={{
          padding: 12, marginBottom: 12, background: 'var(--bg-panel)',
          border: `2px solid ${GRADE_COLORS[rewardMsg.grade] || 'var(--accent)'}`,
          textAlign: 'center', fontSize: 15, fontWeight: 700,
          color: GRADE_COLORS[rewardMsg.grade] || 'var(--accent)',
        }}>
          랜덤 박스 개봉! → {rewardMsg.item}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {quests.map((q) => (
          <div key={q.id} style={{
            padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)',
            opacity: q.locked ? 0.4 : q.claimed ? 0.5 : 1,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: 'var(--accent)' }}>
                  {q.name}
                  {q.claimed && <span style={{ marginLeft: 10, color: 'var(--success)', fontSize: 12 }}>완료</span>}
                  {q.completed && !q.claimed && <span style={{ marginLeft: 10, color: 'var(--accent)', fontSize: 12 }}>달성!</span>}
                </div>
                <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{q.description}</div>
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  {q.targetName}: <b>{q.progress}/{q.targetCount}</b>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#e0a040' }}>
                  보상: 랜덤 박스 (일반~전설)
                </div>
                {q.locked && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>Lv.{q.requiredLevel} 필요</div>}
              </div>
              <div>
                {!q.locked && !q.accepted && <button className="primary" onClick={() => accept(q.id)}>수락</button>}
                {q.completed && !q.claimed && <button className="primary" onClick={() => claim(q.id)}>보상</button>}
              </div>
            </div>
          </div>
        ))}
        {quests.length === 0 && <div style={{ color: 'var(--text-dim)' }}>퀘스트가 없다.</div>}
      </div>
    </div>
  );
}
