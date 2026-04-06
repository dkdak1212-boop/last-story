import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Stats {
  totalUsers: number; totalCharacters: number; active24h: number;
  totalGuilds: number; openAuctions: number; openFeedback: number;
  topLevel: string; topGold: string;
}
interface AdminAnnouncement {
  id: number; title: string; body: string; priority: string; active: boolean;
  created_at: string; expires_at: string | null; author: string | null;
}
interface AdminFeedback {
  id: number; category: string; text: string; status: string; admin_note: string | null;
  created_at: string; username: string; character_name: string | null;
}

export function AdminScreen() {
  const [tab, setTab] = useState<'stats' | 'announcements' | 'feedback' | 'grant'>('stats');
  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>관리자 대시보드</h2>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button className={tab === 'stats' ? 'primary' : ''} onClick={() => setTab('stats')}>통계</button>
        <button className={tab === 'announcements' ? 'primary' : ''} onClick={() => setTab('announcements')}>공지 관리</button>
        <button className={tab === 'feedback' ? 'primary' : ''} onClick={() => setTab('feedback')}>피드백</button>
        <button className={tab === 'grant' ? 'primary' : ''} onClick={() => setTab('grant')}>지급</button>
      </div>
      {tab === 'stats' && <StatsTab />}
      {tab === 'announcements' && <AnnouncementsTab />}
      {tab === 'feedback' && <FeedbackTab />}
      {tab === 'grant' && <GrantTab />}
    </div>
  );
}

function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => { api<Stats>('/admin/stats').then(setStats); }, []);
  if (!stats) return <div style={{ color: 'var(--text-dim)' }}>로딩...</div>;
  const items = [
    { label: '총 유저', value: stats.totalUsers },
    { label: '총 캐릭터', value: stats.totalCharacters },
    { label: '24시간 활동', value: stats.active24h },
    { label: '길드 수', value: stats.totalGuilds },
    { label: '진행 중 경매', value: stats.openAuctions },
    { label: '대기 피드백', value: stats.openFeedback },
    { label: '최고 레벨', value: stats.topLevel },
    { label: '최고 재력', value: stats.topGold },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
      {items.map(i => (
        <div key={i.label} style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>{i.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{i.value}</div>
        </div>
      ))}
    </div>
  );
}

function AnnouncementsTab() {
  const [items, setItems] = useState<AdminAnnouncement[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<'normal' | 'important' | 'urgent'>('normal');

  async function load() { setItems(await api<AdminAnnouncement[]>('/admin/announcements')); }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!title || !body) return;
    await api('/admin/announcements', { method: 'POST', body: JSON.stringify({ title, body, priority }) });
    setTitle(''); setBody(''); setPriority('normal'); load();
  }
  async function toggle(id: number) { await api(`/admin/announcements/${id}/toggle`, { method: 'POST' }); load(); }
  async function del(id: number) {
    if (!confirm('삭제하시겠습니까?')) return;
    await api(`/admin/announcements/${id}/delete`, { method: 'POST' }); load();
  }

  return (
    <div>
      <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>새 공지</div>
        <input placeholder="제목" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} style={{ width: '100%', marginBottom: 8 }} />
        <textarea placeholder="내용" value={body} onChange={e => setBody(e.target.value)} rows={4} style={{ width: '100%', marginBottom: 8, fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>우선순위:</span>
          {(['normal', 'important', 'urgent'] as const).map(p => (
            <button key={p} onClick={() => setPriority(p)} className={priority === p ? 'primary' : ''} style={{ fontSize: 12, padding: '3px 10px' }}>
              {p === 'normal' ? '일반' : p === 'important' ? '중요' : '긴급'}
            </button>
          ))}
        </div>
        <button className="primary" onClick={create} disabled={!title || !body}>등록</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(a => (
          <div key={a.id} style={{
            padding: 10, background: 'var(--bg-panel)', border: '1px solid var(--border)',
            opacity: a.active ? 1 : 0.5,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 11, color: 'var(--accent)', marginRight: 8 }}>{a.priority}</span>
                <span style={{ fontWeight: 700 }}>{a.title}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => toggle(a.id)} style={{ fontSize: 11, padding: '3px 8px' }}>{a.active ? '비활성' : '활성화'}</button>
                <button onClick={() => del(a.id)} style={{ fontSize: 11, padding: '3px 8px' }}>삭제</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedbackTab() {
  const [items, setItems] = useState<AdminFeedback[]>([]);
  const [filter, setFilter] = useState('');
  async function load() {
    const q = filter ? `?status=${filter}` : '';
    setItems(await api<AdminFeedback[]>(`/admin/feedback${q}`));
  }
  useEffect(() => { load(); }, [filter]);

  async function respond(id: number) {
    const status = prompt('상태 (open|reviewing|resolved|closed)', 'reviewing');
    if (!status) return;
    const note = prompt('답변 (선택)', '');
    await api(`/admin/feedback/${id}/respond`, { method: 'POST', body: JSON.stringify({ status, adminNote: note }) });
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['', 'open', 'reviewing', 'resolved', 'closed'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={filter === s ? 'primary' : ''} style={{ fontSize: 12, padding: '3px 10px' }}>
            {s || '전체'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(f => (
          <div key={f.id} style={{ padding: 10, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 12 }}>
                <b style={{ color: 'var(--accent)' }}>{f.category}</b>
                <span style={{ marginLeft: 10, color: 'var(--text-dim)' }}>{f.username} / {f.character_name || '-'}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{f.status}</div>
            </div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 6 }}>{f.text}</div>
            {f.admin_note && <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 6, borderLeft: '2px solid var(--accent)', marginBottom: 6 }}>{f.admin_note}</div>}
            <button onClick={() => respond(f.id)} style={{ fontSize: 11, padding: '3px 10px' }}>답변/상태 변경</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function GrantTab() {
  const [charId, setCharId] = useState('');
  const [gold, setGold] = useState('');
  const [exp, setExp] = useState('');
  const [msg, setMsg] = useState('');
  async function grant() {
    const body: Record<string, number> = { characterId: Number(charId) };
    if (gold) body.gold = Number(gold);
    if (exp) body.exp = Number(exp);
    try {
      await api('/admin/grant', { method: 'POST', body: JSON.stringify(body) });
      setMsg('지급 완료'); setCharId(''); setGold(''); setExp('');
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }
  return (
    <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', maxWidth: 400 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>캐릭터 ID</div>
        <input value={charId} onChange={e => setCharId(e.target.value)} style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>골드 (선택)</div>
        <input type="number" value={gold} onChange={e => setGold(e.target.value)} style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>경험치 (선택)</div>
        <input type="number" value={exp} onChange={e => setExp(e.target.value)} style={{ width: '100%' }} />
      </div>
      <button className="primary" onClick={grant} disabled={!charId}>지급</button>
      {msg && <div style={{ marginTop: 8, fontSize: 13 }}>{msg}</div>}
    </div>
  );
}
