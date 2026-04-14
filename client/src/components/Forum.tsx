import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

type BoardType = 'free' | 'guide';

interface ListItem {
  id: number;
  boardType: BoardType;
  characterName: string;
  className: string;
  title: string;
  targetClass?: string | null;
  targetLevel?: number | null;
  commentCount: number;
  viewCount: number;
  createdAt: string;
}

interface CommentRow {
  id: number;
  characterName: string;
  className: string;
  body: string;
  createdAt: string;
  isOwner: boolean;
}

interface Detail extends ListItem {
  body: string;
  comments: CommentRow[];
  isOwner: boolean;
  isAdmin: boolean;
}

const PAGE_SIZE = 20;

const CLASS_LABEL: Record<string, string> = {
  warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적', summoner: '소환사', all: '전체',
};
const CLASS_COLOR: Record<string, string> = {
  warrior: '#e04040', mage: '#6688ff', cleric: '#ffcc44', rogue: '#aa66cc', summoner: '#44ccaa',
};

function fmtTime(s: string) {
  const t = new Date(s);
  return `${t.getMonth() + 1}/${t.getDate()} ${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`;
}

export function Forum() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const [tab, setTab] = useState<BoardType>('free');
  const [items, setItems] = useState<ListItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetClass, setTargetClass] = useState('');
  const [targetLevel, setTargetLevel] = useState('');
  const [commentText, setCommentText] = useState('');
  const [errMsg, setErrMsg] = useState('');

  async function load(reset: boolean) {
    const off = reset ? 0 : offset;
    try {
      const r = await api<ListItem[]>(`/forum?type=${tab}&offset=${off}&limit=${PAGE_SIZE}`);
      setItems(reset ? r : [...items, ...r]);
      setOffset(off + r.length);
      setHasMore(r.length === PAGE_SIZE);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '실패');
    }
  }

  useEffect(() => {
    setItems([]); setOffset(0); setOpenId(null); setDetail(null); setWriting(false); setErrMsg('');
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function openPost(id: number) {
    if (openId === id) {
      setOpenId(null); setDetail(null);
      return;
    }
    setOpenId(id); setDetail(null); setCommentText('');
    try {
      setDetail(await api<Detail>(`/forum/${id}`));
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '실패');
    }
  }

  async function submitPost() {
    if (!active || !title.trim() || !body.trim()) return;
    setErrMsg('');
    try {
      await api('/forum', {
        method: 'POST',
        body: JSON.stringify({
          characterId: active.id,
          boardType: tab,
          title: title.trim(),
          body: body.trim(),
          targetClass: tab === 'guide' ? (targetClass || null) : null,
          targetLevel: tab === 'guide' && targetLevel ? Number(targetLevel) : null,
        }),
      });
      setWriting(false); setTitle(''); setBody(''); setTargetClass(''); setTargetLevel('');
      load(true);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '실패');
    }
  }

  async function submitComment() {
    if (!active || !openId || !commentText.trim()) return;
    setErrMsg('');
    try {
      await api(`/forum/${openId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ characterId: active.id, body: commentText.trim() }),
      });
      setCommentText('');
      setDetail(await api<Detail>(`/forum/${openId}`));
      // 목록의 commentCount 동기화
      setItems(items.map(it => it.id === openId ? { ...it, commentCount: it.commentCount + 1 } : it));
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '실패');
    }
  }

  async function deletePost(id: number) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await api(`/forum/${id}/delete`, { method: 'POST' });
      setOpenId(null); setDetail(null);
      load(true);
    } catch (e) { setErrMsg(e instanceof Error ? e.message : '실패'); }
  }

  async function deleteComment(commentId: number) {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;
    try {
      await api(`/forum/comments/${commentId}/delete`, { method: 'POST' });
      if (openId) setDetail(await api<Detail>(`/forum/${openId}`));
      setItems(items.map(it => it.id === openId ? { ...it, commentCount: Math.max(0, it.commentCount - 1) } : it));
    } catch (e) { setErrMsg(e instanceof Error ? e.message : '실패'); }
  }

  async function reportPost(id: number) {
    const reason = prompt('신고 사유 (선택, 200자 이내)') || '';
    try {
      await api(`/forum/${id}/report`, { method: 'POST', body: JSON.stringify({ reason }) });
      alert('신고가 접수되었습니다.');
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }
  async function reportComment(id: number) {
    const reason = prompt('신고 사유 (선택, 200자 이내)') || '';
    try {
      await api(`/forum/comments/${id}/report`, { method: 'POST', body: JSON.stringify({ reason }) });
      alert('신고가 접수되었습니다.');
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }

  const accent = '#daa520';
  return (
    <div style={{
      padding: 16, borderRadius: 8, marginBottom: 16,
      background: 'linear-gradient(135deg, rgba(218,165,32,0.06) 0%, rgba(224,128,48,0.04) 100%)',
      border: '1px solid rgba(218,165,32,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(218,165,32,0.15)' }}>
        <span style={{ fontSize: 18 }}>📜</span>
        <span style={{ fontSize: 15, fontWeight: 900, color: accent, letterSpacing: 1 }}>게시판</span>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['free', 'guide'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
            background: tab === t ? accent : 'transparent',
            color: tab === t ? '#000' : accent,
            border: `1px solid ${accent}`,
          }}>{t === 'free' ? '자유게시판' : '공략게시판'}</button>
        ))}
        <button onClick={() => { setWriting(!writing); setErrMsg(''); }} disabled={!active} style={{
          marginLeft: 'auto', padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: 4,
          background: writing ? 'transparent' : accent,
          color: writing ? accent : '#000',
          border: `1px solid ${accent}`,
          cursor: active ? 'pointer' : 'default',
          opacity: active ? 1 : 0.5,
        }}>{writing ? '취소' : '+ 글쓰기'}</button>
      </div>

      {/* 작성 폼 */}
      {writing && (
        <div style={{
          padding: 12, marginBottom: 12, borderRadius: 6,
          background: 'rgba(218,165,32,0.06)', border: '1px solid rgba(218,165,32,0.2)',
        }}>
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="제목 (최대 60자)" maxLength={60}
            style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', padding: '8px 12px', fontSize: 13, borderRadius: 4, marginBottom: 8 }}
          />
          {tab === 'guide' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select value={targetClass} onChange={e => setTargetClass(e.target.value)}
                style={{ padding: '6px 8px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 12 }}>
                <option value="">직업 (전체)</option>
                <option value="warrior">전사</option>
                <option value="mage">마법사</option>
                <option value="cleric">성직자</option>
                <option value="rogue">도적</option>
                <option value="summoner">소환사</option>
              </select>
              <input type="number" value={targetLevel} onChange={e => setTargetLevel(e.target.value)}
                placeholder="권장 Lv." min={1} max={200}
                style={{ width: 100, padding: '6px 8px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 12 }} />
            </div>
          )}
          <textarea
            value={body} onChange={e => setBody(e.target.value)}
            placeholder="본문 (최대 2000자)" maxLength={2000} rows={6}
            style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', padding: '8px 12px', fontSize: 13, borderRadius: 4, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{body.length} / 2000 · 3분에 1글</span>
            <button onClick={submitPost} disabled={!title.trim() || !body.trim()} style={{
              padding: '6px 18px', fontSize: 12, fontWeight: 700,
              background: title.trim() && body.trim() ? accent : 'transparent',
              color: title.trim() && body.trim() ? '#000' : 'var(--text-dim)',
              border: `1px solid ${accent}`, borderRadius: 4,
              cursor: title.trim() && body.trim() ? 'pointer' : 'default',
            }}>작성</button>
          </div>
        </div>
      )}

      {errMsg && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{errMsg}</div>}

      {/* 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 20 }}>아직 글이 없습니다.</div>}
        {items.map(it => {
          const isOpen = openId === it.id;
          return (
            <div key={it.id} style={{
              borderRadius: 6,
              background: isOpen ? 'rgba(218,165,32,0.08)' : 'rgba(218,165,32,0.03)',
              border: '1px solid rgba(218,165,32,0.15)',
            }}>
              <div onClick={() => openPost(it.id)} style={{
                padding: '10px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {it.boardType === 'guide' && (it.targetClass || it.targetLevel) && (
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 700,
                    background: `${CLASS_COLOR[it.targetClass || ''] || '#888'}22`,
                    color: CLASS_COLOR[it.targetClass || ''] || '#888',
                    border: `1px solid ${CLASS_COLOR[it.targetClass || ''] || '#888'}55`,
                  }}>
                    {CLASS_LABEL[it.targetClass || 'all'] || '전체'}
                    {it.targetLevel ? ` Lv.${it.targetLevel}+` : ''}
                  </span>
                )}
                <span style={{ flex: 1, fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{it.title}</span>
                {it.commentCount > 0 && <span style={{ fontSize: 11, color: accent, fontWeight: 700 }}>[{it.commentCount}]</span>}
                <span style={{
                  fontSize: 10, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                  background: `${CLASS_COLOR[it.className] || '#888'}22`,
                  color: CLASS_COLOR[it.className] || '#888',
                }}>{CLASS_LABEL[it.className]}</span>
                <span style={{ fontSize: 11, color: 'var(--accent)' }}>{it.characterName}</span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{fmtTime(it.createdAt)}</span>
              </div>

              {isOpen && (
                <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(218,165,32,0.2)' }}>
                  {!detail && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>불러오는 중...</div>}
                  {detail && detail.id === it.id && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>조회 {detail.viewCount}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {(detail.isOwner || detail.isAdmin) && (
                            <button onClick={() => deletePost(it.id)} style={{
                              fontSize: 10, padding: '2px 8px', color: 'var(--danger)',
                              border: '1px solid var(--danger)', background: 'transparent', borderRadius: 3, cursor: 'pointer',
                            }}>삭제</button>
                          )}
                          {!detail.isOwner && active && (
                            <button onClick={() => reportPost(it.id)} style={{
                              fontSize: 10, padding: '2px 8px', color: 'var(--text-dim)',
                              border: '1px solid var(--border)', background: 'transparent', borderRadius: 3, cursor: 'pointer',
                            }}>신고</button>
                          )}
                        </div>
                      </div>
                      <div style={{
                        whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: 'var(--text)',
                        padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 4, marginBottom: 12,
                      }}>{detail.body}</div>

                      {/* 댓글 */}
                      <div style={{ fontSize: 11, fontWeight: 700, color: accent, marginBottom: 6 }}>댓글 {detail.comments.length}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                        {detail.comments.map(c => (
                          <div key={c.id} style={{
                            padding: '6px 10px', fontSize: 12, borderRadius: 4,
                            background: 'rgba(0,0,0,0.15)',
                            display: 'flex', alignItems: 'flex-start', gap: 6,
                          }}>
                            <span style={{
                              fontSize: 10, padding: '0 5px', borderRadius: 2, fontWeight: 700,
                              background: `${CLASS_COLOR[c.className] || '#888'}22`,
                              color: CLASS_COLOR[c.className] || '#888',
                            }}>{CLASS_LABEL[c.className]}</span>
                            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{c.characterName}</span>
                            <span style={{ flex: 1, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{c.body}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{fmtTime(c.createdAt)}</span>
                            {(c.isOwner || detail.isAdmin) && (
                              <button onClick={() => deleteComment(c.id)} style={{
                                fontSize: 9, padding: '0 4px', color: 'var(--text-dim)',
                                border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer',
                              }}>X</button>
                            )}
                            {!c.isOwner && active && (
                              <button onClick={() => reportComment(c.id)} style={{
                                fontSize: 9, padding: '0 4px', color: 'var(--text-dim)',
                                border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer',
                              }}>신고</button>
                            )}
                          </div>
                        ))}
                      </div>
                      {active && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            value={commentText} onChange={e => setCommentText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && submitComment()}
                            placeholder="댓글 (최대 500자, 30초 쿨)"
                            maxLength={500}
                            style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', padding: '6px 10px', fontSize: 12, borderRadius: 4 }}
                          />
                          <button onClick={submitComment} disabled={!commentText.trim()} style={{
                            padding: '6px 14px', fontSize: 12, fontWeight: 700,
                            background: commentText.trim() ? accent : 'transparent',
                            color: commentText.trim() ? '#000' : 'var(--text-dim)',
                            border: `1px solid ${accent}`, borderRadius: 4,
                            cursor: commentText.trim() ? 'pointer' : 'default',
                          }}>등록</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <button onClick={() => load(false)} style={{
            padding: '6px 20px', fontSize: 12, fontWeight: 700,
            background: 'transparent', color: accent,
            border: `1px solid ${accent}`, borderRadius: 4, cursor: 'pointer',
          }}>더 보기</button>
        </div>
      )}
    </div>
  );
}
