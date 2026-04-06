import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface MyFeedback {
  id: number; category: string; text: string; status: string;
  admin_note: string | null; created_at: string; updated_at: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  bug: '버그 신고', suggestion: '제안', balance: '밸런스', other: '기타',
};
const STATUS_LABEL: Record<string, string> = {
  open: '접수됨', reviewing: '검토 중', resolved: '해결됨', closed: '종료',
};
const STATUS_COLOR: Record<string, string> = {
  open: 'var(--text-dim)', reviewing: 'var(--accent)',
  resolved: 'var(--success)', closed: 'var(--text-dim)',
};

export function FeedbackScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const [tab, setTab] = useState<'submit' | 'mine'>('submit');
  const [category, setCategory] = useState<'bug' | 'suggestion' | 'balance' | 'other'>('bug');
  const [text, setText] = useState('');
  const [mine, setMine] = useState<MyFeedback[]>([]);
  const [msg, setMsg] = useState('');

  async function loadMine() {
    setMine(await api<MyFeedback[]>('/feedback/mine'));
  }
  useEffect(() => { if (tab === 'mine') loadMine(); }, [tab]);

  async function submit() {
    if (text.trim().length < 5) { setMsg('최소 5자 이상 입력해주세요'); return; }
    setMsg('');
    try {
      await api('/feedback', {
        method: 'POST',
        body: JSON.stringify({ category, text: text.trim(), characterId: active?.id }),
      });
      setMsg('피드백이 전송되었습니다. 감사합니다!');
      setText('');
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>피드백</h2>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button className={tab === 'submit' ? 'primary' : ''} onClick={() => setTab('submit')}>제출</button>
        <button className={tab === 'mine' ? 'primary' : ''} onClick={() => setTab('mine')}>내 피드백</button>
      </div>

      {tab === 'submit' && (
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 6 }}>분류</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['bug', 'suggestion', 'balance', 'other'] as const).map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  className={category === c ? 'primary' : ''}
                  style={{ fontSize: 12, padding: '4px 12px' }}>
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 6 }}>내용 (5~2000자)</div>
            <textarea value={text} onChange={e => setText(e.target.value)}
              maxLength={2000} rows={8} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="상세하게 적어주시면 빠르게 처리됩니다." />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'right' }}>{text.length}/2000</div>
          </div>
          {msg && <div style={{ color: msg.includes('감사') ? 'var(--success)' : 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{msg}</div>}
          <button className="primary" onClick={submit} disabled={text.trim().length < 5}>제출</button>
        </div>
      )}

      {tab === 'mine' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mine.length === 0 && <div style={{ color: 'var(--text-dim)' }}>제출한 피드백이 없습니다.</div>}
          {mine.map(f => (
            <div key={f.id} style={{ padding: 12, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{CATEGORY_LABEL[f.category]}</span>
                  <span style={{ fontSize: 11, color: STATUS_COLOR[f.status], fontWeight: 700 }}>
                    {STATUS_LABEL[f.status]}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {new Date(f.created_at).toLocaleString('ko-KR')}
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', marginBottom: 6 }}>{f.text}</div>
              {f.admin_note && (
                <div style={{ padding: 8, marginTop: 8, background: 'var(--bg)', borderLeft: '3px solid var(--accent)', fontSize: 12 }}>
                  <div style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>운영자 답변</div>
                  <div style={{ color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>{f.admin_note}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
