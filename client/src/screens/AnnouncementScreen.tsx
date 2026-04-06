import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Announcement {
  id: number; title: string; body: string; priority: string; created_at: string; expires_at: string | null;
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--danger)', important: 'var(--accent)', normal: 'var(--text-dim)',
};
const PRIORITY_LABEL: Record<string, string> = {
  urgent: '긴급', important: '중요', normal: '일반',
};

export function AnnouncementScreen() {
  const [items, setItems] = useState<Announcement[]>([]);

  useEffect(() => {
    api<Announcement[]>('/announcements').then(setItems).catch(() => {});
  }, []);

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>공지사항</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 && <div style={{ color: 'var(--text-dim)' }}>공지사항이 없습니다.</div>}
        {items.map(a => (
          <div key={a.id} style={{
            padding: 14, background: 'var(--bg-panel)',
            border: `1px solid ${a.priority === 'urgent' ? 'var(--danger)' : 'var(--border)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{
                fontSize: 11, padding: '2px 8px', color: '#1a1612',
                background: PRIORITY_COLOR[a.priority], fontWeight: 700,
              }}>
                {PRIORITY_LABEL[a.priority]}
              </span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{a.title}</span>
            </div>
            <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', marginBottom: 8 }}>{a.body}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {new Date(a.created_at).toLocaleString('ko-KR')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
