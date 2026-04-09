import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface Achievement {
  id: number; code: string; name: string; description: string;
  category: string; title: string; unlocked: boolean; unlockedAt: string | null;
}

const CAT_LABEL: Record<string, string> = {
  level: '레벨', combat: '전투', wealth: '재화', enhance: '강화', pvp: 'PvP', special: '특별',
};
const CAT_COLOR: Record<string, string> = {
  level: '#8b8bef', combat: '#e04040', wealth: '#e0a040', enhance: '#daa520', pvp: '#aa66cc', special: '#66ccff',
};

export function AchievementScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState('all');

  async function load() {
    if (!active) return;
    const d = await api<{ achievements: Achievement[]; currentTitle: string | null }>(`/characters/${active.id}/achievements`);
    setAchievements(d.achievements);
    setCurrentTitle(d.currentTitle);
  }
  useEffect(() => { load(); }, [active?.id]);

  async function setTitle(title: string | null) {
    if (!active) return; setMsg('');
    try {
      await api(`/characters/${active.id}/achievements/set-title`, {
        method: 'POST', body: JSON.stringify({ title }),
      });
      setCurrentTitle(title);
      setMsg(title ? `칭호 "${title}" 설정!` : '칭호 해제');
      await refreshActive();
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  const unlocked = achievements.filter(a => a.unlocked).length;
  const categories = ['all', ...new Set(achievements.map(a => a.category))];
  const filtered = filter === 'all' ? achievements : achievements.filter(a => a.category === filter);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ color: 'var(--accent)', margin: 0 }}>업적</h2>
        <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 700 }}>{unlocked}/{achievements.length} 달성</span>
      </div>

      {currentTitle && (
        <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 8 }}>
          현재 칭호: <strong>{currentTitle}</strong>
          <button onClick={() => setTitle(null)} style={{
            marginLeft: 8, padding: '1px 6px', fontSize: 10,
            background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)', cursor: 'pointer',
          }}>해제</button>
        </div>
      )}

      {msg && <div style={{ color: 'var(--success)', fontSize: 12, marginBottom: 8, fontWeight: 700 }}>{msg}</div>}

      {/* 카테고리 필터 */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 10, flexWrap: 'wrap' }}>
        {categories.map(c => (
          <button key={c} onClick={() => setFilter(c)} style={{
            padding: '4px 10px', fontSize: 11, border: 'none', borderRadius: 3, cursor: 'pointer',
            background: filter === c ? (CAT_COLOR[c] || 'var(--accent)') : 'transparent',
            color: filter === c ? '#000' : 'var(--text-dim)',
            fontWeight: filter === c ? 700 : 400,
          }}>{c === 'all' ? '전체' : CAT_LABEL[c] || c}</button>
        ))}
      </div>

      {/* 업적 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map(a => (
          <div key={a.id} style={{
            padding: '10px 12px', borderRadius: 4, background: 'var(--bg-panel)',
            borderLeft: `3px solid ${a.unlocked ? (CAT_COLOR[a.category] || 'var(--success)') : 'var(--border)'}`,
            opacity: a.unlocked ? 1 : 0.5,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13, color: a.unlocked ? 'var(--text)' : 'var(--text-dim)' }}>
                  {a.name}
                </span>
                <span style={{ fontSize: 10, color: CAT_COLOR[a.category] || 'var(--text-dim)', marginLeft: 6 }}>
                  {CAT_LABEL[a.category] || a.category}
                </span>
              </div>
              {a.unlocked && a.title && (
                <button onClick={() => setTitle(a.title)} disabled={currentTitle === a.title} style={{
                  padding: '2px 8px', fontSize: 10, borderRadius: 3,
                  background: currentTitle === a.title ? 'var(--accent)' : 'transparent',
                  color: currentTitle === a.title ? '#000' : 'var(--accent)',
                  border: `1px solid var(--accent)`, cursor: currentTitle === a.title ? 'default' : 'pointer',
                }}>
                  {currentTitle === a.title ? '사용 중' : '칭호'}
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{a.description}</div>
            {a.unlocked && a.title && (
              <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 2 }}>칭호: {a.title}</div>
            )}
            {a.unlocked && a.unlockedAt && (
              <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
                {new Date(a.unlockedAt).toLocaleDateString('ko-KR')} 달성
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
