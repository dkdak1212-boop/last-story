import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../../stores/authStore';
import { useCharacterStore } from '../../stores/characterStore';
import { api } from '../../api/client';

interface ChatMsg {
  id?: number; channel: string; from: string; text: string; createdAt?: string; scopeId?: number | null;
}

type Channel = 'global' | 'trade' | 'guild' | 'party';
const CHANNELS: { id: Channel; label: string }[] = [
  { id: 'global', label: '전체' }, { id: 'trade', label: '거래' },
  { id: 'guild', label: '길드' }, { id: 'party', label: '파티' },
];

export function ChatPanel() {
  const token = useAuthStore((s) => s.token);
  const activeId = useCharacterStore((s) => s.activeCharacter?.id);
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>('global');
  const [messages, setMessages] = useState<Record<Channel, ChatMsg[]>>({ global: [], trade: [], guild: [], party: [] });
  const [input, setInput] = useState('');
  const [scopeIds, setScopeIds] = useState<{ guild: number | null; party: number | null }>({ guild: null, party: null });
  const socketRef = useRef<Socket | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 길드/파티 스코프 ID 가져오기
  useEffect(() => {
    if (!activeId) return;
    (async () => {
      try {
        const g = await api<{ guild: { id: number } | null }>(`/guilds/my/${activeId}`);
        const p = await api<{ party: { id: number } | null }>(`/party/my/${activeId}`);
        setScopeIds({ guild: g.guild?.id ?? null, party: p.party?.id ?? null });
      } catch {}
    })();
  }, [activeId]);

  useEffect(() => {
    if (!token) return;
    // 히스토리 로드
    (['global', 'trade', 'guild', 'party'] as Channel[]).forEach(async (ch) => {
      try {
        const scopeParam = ch === 'guild' ? `&scopeId=${scopeIds.guild ?? 0}` : ch === 'party' ? `&scopeId=${scopeIds.party ?? 0}` : '';
        const hist = await api<ChatMsg[]>(`/chat/history?channel=${ch}${scopeParam}`);
        setMessages((m) => ({ ...m, [ch]: hist }));
      } catch {}
    });

    const socket = io({ auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('chat', (msg: ChatMsg) => {
      // 길드/파티는 내 스코프 ID와 일치해야 표시
      if (msg.channel === 'guild' && msg.scopeId !== scopeIds.guild) return;
      if (msg.channel === 'party' && msg.scopeId !== scopeIds.party) return;
      setMessages((m) => ({
        ...m,
        [msg.channel as Channel]: [...(m[msg.channel as Channel] || []), msg].slice(-100),
      }));
    });
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [token, scopeIds.guild, scopeIds.party]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, channel, open]);

  function send() {
    if (!input.trim() || !socketRef.current) return;
    socketRef.current.emit('chat', { channel, text: input.trim(), characterId: activeId });
    setInput('');
  }

  const needsScope = channel === 'guild' || channel === 'party';
  const scopeMissing = (channel === 'guild' && !scopeIds.guild) || (channel === 'party' && !scopeIds.party);

  return (
    <div style={{
      position: 'fixed', bottom: 0, right: 16,
      width: open ? 380 : 140, background: 'var(--bg-panel)',
      border: '1px solid var(--border)', borderBottom: 'none', zIndex: 100,
      transition: 'width 0.2s',
    }}>
      <div onClick={() => setOpen(!open)} style={{
        padding: '8px 12px', cursor: 'pointer', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        borderBottom: open ? '1px solid var(--border)' : 'none',
      }}>
        <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>채팅</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{open ? '▼' : '▲'}</span>
      </div>

      {open && (
        <div>
          <div style={{ display: 'flex', gap: 4, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
            {CHANNELS.map((c) => (
              <button key={c.id} onClick={() => setChannel(c.id)}
                className={channel === c.id ? 'primary' : ''}
                style={{ fontSize: 11, padding: '4px 10px' }}>
                {c.label}
              </button>
            ))}
          </div>
          <div ref={bodyRef} style={{
            height: 240, overflowY: 'auto', padding: 8, fontSize: 12,
            fontFamily: 'monospace', background: 'var(--bg)',
          }}>
            {scopeMissing && (
              <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
                {channel === 'guild' ? '길드에 가입해야 이용 가능' : '파티에 속해야 이용 가능'}
              </div>
            )}
            {!scopeMissing && messages[channel].map((m, i) => (
              <div key={m.id ?? `${i}-${m.createdAt}`} style={{ marginBottom: 3 }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{m.from}:</span>{' '}
                <span style={{ color: 'var(--text)' }}>{m.text}</span>
              </div>
            ))}
            {!scopeMissing && messages[channel].length === 0 && (
              <div style={{ color: 'var(--text-dim)' }}>메시지가 없다.</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, padding: 6, borderTop: '1px solid var(--border)' }}>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={needsScope && scopeMissing ? '사용 불가' : `${CHANNELS.find(c => c.id === channel)?.label} 채팅`}
              maxLength={200} disabled={needsScope && scopeMissing}
              style={{ flex: 1, fontSize: 12 }} />
            <button onClick={send} className="primary" style={{ fontSize: 12, padding: '4px 12px' }}
              disabled={needsScope && scopeMissing}>
              전송
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
