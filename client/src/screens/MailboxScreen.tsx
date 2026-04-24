import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { ItemGrade, InventorySlot } from '../types';
import { GRADE_COLOR } from '../components/ui/ItemStats';

interface MailRow {
  id: number; subject: string; body: string;
  itemId: number | null; itemQuantity: number | null;
  itemName: string | null; itemGrade: ItemGrade | null;
  gold: number; claimed: boolean; createdAt: string;
}

export function MailboxScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [mails, setMails] = useState<MailRow[]>([]);
  const [msg, setMsg] = useState('');

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
      setMsg('수령 완료!');
      await refresh();
      await refreshActive();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '수령 실패');
    }
  }

  // 수령/발송 메시지 1.5초 후 자동 클리어
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 1500);
    return () => clearTimeout(t);
  }, [msg]);

  async function del(mailId: number) {
    if (!active) return;
    await api(`/characters/${active.id}/mailbox/${mailId}/delete`, { method: 'POST' });
    refresh();
  }

  const unclaimedCount = mails.filter(m => !m.claimed).length;

  const [tab, setTab] = useState<'inbox' | 'send'>('inbox');
  const [sendTo, setSendTo] = useState('');
  const [sendGold, setSendGold] = useState(0);
  const [sendSlot, setSendSlot] = useState(-1);
  const [inv, setInv] = useState<InventorySlot[]>([]);
  const [sending, setSending] = useState(false);

  async function loadInv() {
    if (!active) return;
    const d = await api<{ inventory: InventorySlot[] }>(`/characters/${active.id}/inventory`);
    setInv(d.inventory);
  }

  async function sendMail() {
    if (!active || sending) return;
    if (!sendTo.trim()) return setMsg('받는 캐릭터 이름을 입력해주세요.');
    if (sendGold <= 0 && sendSlot < 0) return setMsg('골드 또는 아이템을 선택해주세요.');
    if (sendGold > 0 && !confirm(`${sendTo}에게 ${sendGold.toLocaleString()}G를 보내시겠습니까?`)) return;
    setSending(true);
    try {
      const r = await api<{ ok: boolean; recipientName: string }>(
        `/characters/${active.id}/mailbox/send`,
        { method: 'POST', body: JSON.stringify({ recipientName: sendTo.trim(), gold: sendGold, slotIndex: sendSlot }) }
      );
      setMsg(`${r.recipientName}에게 발송 완료!`);
      setSendTo(''); setSendGold(0); setSendSlot(-1);
      await refreshActive();
      loadInv();
    } catch (e) { setMsg(e instanceof Error ? e.message : '발송 실패'); }
    finally { setSending(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ color: 'var(--accent)' }}>우편함</h2>
        {unclaimedCount > 0 && tab === 'inbox' && (
          <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>미수령 {unclaimedCount}건</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button className={tab === 'inbox' ? 'primary' : ''} onClick={() => setTab('inbox')}>받은 우편</button>
      </div>
      {/* 수령 완료 등 메시지 — 플로팅(고정 위치)이라 메일 목록 레이아웃을 밀지 않음 */}
      {msg && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 1100,
          padding: '8px 14px', borderRadius: 4, fontSize: 13, fontWeight: 700,
          background: 'var(--bg-panel)',
          border: `1px solid ${msg.includes('실패') || msg.includes('찾을') || msg.includes('부족') || msg.includes('full') ? 'var(--danger)' : 'var(--success)'}`,
          color: msg.includes('실패') || msg.includes('찾을') || msg.includes('부족') || msg.includes('full') ? 'var(--danger)' : 'var(--success)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}>{msg}</div>
      )}

      {tab === 'send' && (
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>받는 캐릭터</div>
              <input value={sendTo} onChange={e => setSendTo(e.target.value)} placeholder="캐릭터 닉네임"
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>골드 (0이면 안 보냄)</div>
              <input type="number" min={0} value={sendGold} onChange={e => setSendGold(Math.max(0, Number(e.target.value) || 0))}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>아이템 (선택)</div>
              <select value={sendSlot} onChange={e => setSendSlot(Number(e.target.value))}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4 }}>
                <option value={-1}>— 아이템 안 보냄 —</option>
                {inv.filter(s => !(s as any).locked).map(s => (
                  <option key={s.slotIndex} value={s.slotIndex}>
                    {(s as any).prefixName ? `${(s as any).prefixName} ` : ''}{s.item.name}
                    {s.item.slot && (s as any).quality !== undefined ? ` (품질 ${(s as any).quality}%)` : ''}
                    {s.quantity > 1 ? ` x${s.quantity}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <button className="primary" onClick={sendMail} disabled={sending}
              style={{ padding: '10px 0', fontSize: 14, fontWeight: 700 }}>
              {sending ? '발송 중...' : '우편 보내기'}
            </button>
          </div>
        </div>
      )}

      {tab === 'inbox' && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
      </div>}
    </div>
  );
}
