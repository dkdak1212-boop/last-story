import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { ItemGrade } from '../types';
import { GRADE_COLOR } from '../components/ui/ItemStats';

interface MailRow {
  id: number; subject: string; body: string;
  itemId: number | null; itemQuantity: number | null;
  itemName: string | null; itemGrade: ItemGrade | null;
  gold: number; claimed: boolean; createdAt: string;
}

export function MailboxScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const [mails, setMails] = useState<MailRow[]>([]);

  async function refresh() {
    if (!active) return;
    const data = await api<MailRow[]>(`/characters/${active.id}/mailbox`);
    setMails(data);
  }
  useEffect(() => { refresh(); }, [active]);

  async function claim(mailId: number) {
    if (!active) return;
    try {
      await api(`/characters/${active.id}/mailbox/${mailId}/claim`, { method: 'POST' });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : '수령 실패');
    }
  }
  async function del(mailId: number) {
    if (!active) return;
    await api(`/characters/${active.id}/mailbox/${mailId}/delete`, { method: 'POST' });
    refresh();
  }

  return (
    <div>
      <h2 style={{ marginBottom: 20, color: 'var(--accent)' }}>우편함</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mails.length === 0 && <div style={{ color: 'var(--text-dim)' }}>우편이 없다.</div>}
        {mails.map((m) => (
          <div key={m.id} style={{
            padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)',
            opacity: m.claimed ? 0.5 : 1,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{m.subject}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{m.body}</div>
                {(m.itemId || m.gold > 0) && (
                  <div style={{ marginTop: 8, fontSize: 13 }}>
                    {m.itemId && m.itemName && (
                      <span style={{ color: GRADE_COLOR[m.itemGrade || 'common'], fontWeight: 700 }}>
                        {m.itemName} ×{m.itemQuantity}
                      </span>
                    )}
                    {m.gold > 0 && <span style={{ marginLeft: 10, color: 'var(--accent)' }}>{m.gold}G</span>}
                  </div>
                )}
                <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 6 }}>
                  {new Date(m.createdAt).toLocaleString('ko-KR')}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {!m.claimed && <button className="primary" onClick={() => claim(m.id)}>수령</button>}
                <button onClick={() => del(m.id)} style={{ fontSize: 12 }}>삭제</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
