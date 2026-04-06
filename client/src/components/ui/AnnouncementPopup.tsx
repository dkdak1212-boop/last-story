import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';

interface Unread {
  id: number; title: string; body: string; priority: string; created_at: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--danger)', important: 'var(--accent)', normal: 'var(--text-dim)',
};

export function AnnouncementPopup() {
  const isAuth = useAuthStore(s => s.isAuthenticated);
  const [queue, setQueue] = useState<Unread[]>([]);
  const [current, setCurrent] = useState<Unread | null>(null);

  useEffect(() => {
    if (!isAuth) return;
    api<Unread[]>('/announcements/unread').then((items) => {
      if (items.length > 0) {
        setQueue(items);
        setCurrent(items[0]);
      }
    }).catch(() => {});
  }, [isAuth]);

  async function dismiss() {
    if (!current) return;
    await api(`/announcements/${current.id}/read`, { method: 'POST' }).catch(() => {});
    const rest = queue.slice(1);
    setQueue(rest);
    setCurrent(rest[0] ?? null);
  }

  if (!current) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
    }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{
        width: 460, padding: 24, background: 'var(--bg-panel)',
        border: `1px solid ${current.priority === 'urgent' ? 'var(--danger)' : 'var(--accent)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{
            fontSize: 11, padding: '2px 8px', color: '#1a1612',
            background: PRIORITY_COLOR[current.priority], fontWeight: 700,
          }}>
            {current.priority === 'urgent' ? '긴급' : current.priority === 'important' ? '중요' : '일반'}
          </span>
          <h2 style={{ fontSize: 18 }}>{current.title}</h2>
        </div>
        <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', marginBottom: 16, maxHeight: 300, overflowY: 'auto' }}>
          {current.body}
        </div>
        <button className="primary" onClick={dismiss} style={{ width: '100%' }}>
          확인 {queue.length > 1 && `(${queue.length - 1}개 더)`}
        </button>
      </motion.div>
    </div>
  );
}
