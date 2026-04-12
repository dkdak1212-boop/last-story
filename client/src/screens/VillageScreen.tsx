import { useEffect, useState, useRef } from 'react';
import { useCharacterStore } from '../stores/characterStore';
import { api } from '../api/client';

interface DropLog {
  characterName: string;
  itemName: string;
  itemGrade: string;
  prefixCount: number;
  quality: number;
  maxPrefixTier: number;
  createdAt: string;
}

interface EnhanceLog {
  characterName: string;
  itemName: string;
  itemGrade: string;
  fromLevel: number;
  toLevel: number | null;
  success: boolean;
  destroyed: boolean;
  createdAt: string;
}

interface GuestbookEntry {
  id: number;
  characterName: string;
  className: string;
  message: string;
  createdAt: string;
}

const GRADE_COLOR: Record<string, string> = {
  common: '#9a8b75', rare: '#5b8ecc', epic: '#b060cc', legendary: '#e08030',
};
const CLASS_LABEL: Record<string, string> = {
  warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적', summoner: '소환사',
};
const CLASS_COLOR: Record<string, string> = {
  warrior: '#e04040', mage: '#6688ff', cleric: '#ffcc44', rogue: '#aa66cc',
};

function Px({ src, size = 18 }: { src: string; size?: number }) {
  return <img src={src} alt="" width={size} height={size} style={{ imageRendering: 'pixelated', verticalAlign: 'middle' }} />;
}

interface Announcement {
  id: number; title: string; body: string; priority: string; created_at: string;
}
const PRIORITY_COLOR: Record<string, string> = { urgent: 'var(--danger)', important: 'var(--accent)', normal: 'var(--text-dim)' };
const PRIORITY_LABEL: Record<string, string> = { urgent: '긴급', important: '중요', normal: '일반' };

export function VillageScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refresh = useCharacterStore((s) => s.refreshActive);
  const [dropLog, setDropLog] = useState<DropLog[]>([]);
  const [enhanceLog, setEnhanceLog] = useState<EnhanceLog[]>([]);
  const [guestbook, setGuestbook] = useState<GuestbookEntry[]>([]);
  const [gbMsg, setGbMsg] = useState('');
  const [gbText, setGbText] = useState('');
  const [tipsOpen, setTipsOpen] = useState(false);
  const [fbCategory, setFbCategory] = useState('suggestion');
  const [fbText, setFbText] = useState('');
  const [fbMsg, setFbMsg] = useState('');
  const [fbList, setFbList] = useState<{ id: number; category: string; text: string; status: string; admin_note: string | null; created_at: string }[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsOpen, setAnnouncementsOpen] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [bgmPlaying, setBgmPlaying] = useState(false);
  const [bgmEnabled, setBgmEnabled] = useState(() => {
    return localStorage.getItem('bgmEnabled') === '1';
  });
  const [bgmVolume, setBgmVolume] = useState(() => {
    const saved = localStorage.getItem('bgmVolume');
    return saved ? Number(saved) : 0.3;
  });

  useEffect(() => {
    refresh();
    api<DropLog[]>('/drop-log').then(setDropLog).catch(() => {});
    api<EnhanceLog[]>('/enhance-log').then(setEnhanceLog).catch(() => {});
    api<Announcement[]>('/announcements').then(setAnnouncements).catch(() => {});
    loadGuestbook();
    loadFeedback();
  }, [refresh]);

  async function loadFeedback() {
    if (!active) return;
    try { setFbList(await api<typeof fbList>('/feedback/mine')); } catch {}
  }

  async function submitFeedback() {
    if (!active || !fbText.trim()) return;
    setFbMsg('');
    try {
      await api('/feedback', { method: 'POST', body: JSON.stringify({ characterId: active.id, category: fbCategory, text: fbText.trim() }) });
      setFbText(''); setFbMsg('건의가 접수되었습니다!'); loadFeedback();
    } catch (e) { setFbMsg(e instanceof Error ? e.message : '실패'); }
  }

  async function loadGuestbook() {
    try { setGuestbook(await api<GuestbookEntry[]>('/guestbook')); } catch {}
  }

  // BGM — 자동재생 없음, 사용자 토글로 시작/중단. on 상태는 localStorage 유지
  useEffect(() => {
    // 컴포넌트 언마운트 시 정리
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
  }, []);

  // bgmEnabled 변경 시 재생/일시정지
  useEffect(() => {
    if (bgmEnabled) {
      if (!audioRef.current) {
        const audio = new Audio('/bgm.mp3');
        audio.loop = true;
        audio.volume = bgmVolume;
        audioRef.current = audio;
      }
      audioRef.current.play().then(() => setBgmPlaying(true)).catch(() => setBgmPlaying(false));
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        setBgmPlaying(false);
      }
    }
  }, [bgmEnabled]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = bgmVolume;
      localStorage.setItem('bgmVolume', String(bgmVolume));
    }
  }, [bgmVolume]);

  function toggleBgm() {
    const next = !bgmEnabled;
    setBgmEnabled(next);
    localStorage.setItem('bgmEnabled', next ? '1' : '0');
  }

  async function postGuestbook() {
    if (!active || !gbText.trim()) return;
    setGbMsg('');
    try {
      await api('/guestbook', { method: 'POST', body: JSON.stringify({ characterId: active.id, message: gbText.trim() }) });
      setGbText('');
      loadGuestbook();
    } catch (e) { setGbMsg(e instanceof Error ? e.message : '실패'); }
  }

  async function deleteGuestbook(id: number) {
    try { await api(`/guestbook/${id}/delete`, { method: 'POST' }); loadGuestbook(); } catch {}
  }

  function fmtTime(s: string) {
    const t = new Date(s);
    return `${t.getMonth() + 1}/${t.getDate()} ${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`;
  }

  return (
    <div>
      {/* 공지사항 */}
      {announcements.length > 0 && (
        <div style={{ marginBottom: 14, border: '1px solid var(--accent-dim)', borderRadius: 6, overflow: 'hidden' }}>
          <div onClick={() => setAnnouncementsOpen(!announcementsOpen)} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 12px', background: 'rgba(218,165,32,0.06)', cursor: 'pointer',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>공지사항</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{announcementsOpen ? '▲' : '▼'}</span>
          </div>
          {announcementsOpen && (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {announcements.map(a => (
                <div key={a.id} style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', fontWeight: 700,
                      background: PRIORITY_COLOR[a.priority], color: '#1a1612', borderRadius: 2,
                    }}>{PRIORITY_LABEL[a.priority]}</span>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{a.title}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>
                      {new Date(a.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6 }}>{a.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BGM */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', marginBottom: 16,
        background: 'linear-gradient(135deg, rgba(201,162,77,0.06) 0%, rgba(201,162,77,0.02) 100%)',
        border: '1px solid var(--accent-dim)', borderRadius: 6,
      }}>
        <button onClick={toggleBgm} style={{
          width: 32, height: 32, borderRadius: '50%', fontSize: 16,
          background: bgmPlaying ? 'var(--accent)' : 'transparent',
          color: bgmPlaying ? '#000' : 'var(--accent)',
          border: '2px solid var(--accent)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {bgmPlaying ? '\u23F8' : '\u25B6'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>BGM</span>
        <input type="range" min={0} max={100} step={1}
          value={Math.round(bgmVolume * 100)}
          onChange={e => setBgmVolume(Number(e.target.value) / 100)}
          style={{ width: 100, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-dim)', minWidth: 30 }}>{Math.round(bgmVolume * 100)}%</span>
      </div>

      {/* 드롭 축하 + 강화 기록 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        {/* 드롭 축하 */}
        <div style={{
          padding: 14, borderRadius: 8,
          background: 'linear-gradient(135deg, rgba(224,128,48,0.06) 0%, rgba(176,96,204,0.04) 100%)',
          border: '1px solid rgba(224,128,48,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(224,128,48,0.2)' }}>
            <Px src="/images/slots/chest.png" size={22} />
            <span style={{ fontSize: 14, fontWeight: 900, color: '#e08030', letterSpacing: 1 }}>드롭 축하</span>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {dropLog.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>아직 기록이 없습니다.</div>}
            {dropLog.map((d, i) => {
              // 태그 수집: 유니크 / 품질100% / 3옵 / T4
              const tags: { label: string; color: string }[] = [];
              if (d.itemGrade === 'unique') tags.push({ label: '유니크', color: '#ff8c2a' });
              if (d.quality >= 100) tags.push({ label: '품질 100%', color: '#ff8800' });
              if (d.prefixCount >= 3) tags.push({ label: '3옵', color: '#b060cc' });
              if (d.maxPrefixTier >= 4) tags.push({ label: 'T4', color: '#ff4444' });
              const isUnique = d.itemGrade === 'unique';
              return (
                <div key={i} style={{ padding: '4px 0', fontSize: 12, borderBottom: i < dropLog.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: 10, marginRight: 6 }}>{fmtTime(d.createdAt)}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{d.characterName}</span>
                  {' '}
                  {isUnique ? (
                    <>
                      <img src="/images/skills/spells/starburst.png" alt="" width={14} height={14}
                        style={{ imageRendering: 'pixelated', verticalAlign: 'middle', marginRight: 3 }} />
                      <span style={{
                        fontWeight: 700,
                        background: 'linear-gradient(90deg, #ff3b3b, #ff8c2a, #ffe135, #3bd96b, #3bc8ff, #6b5bff, #c452ff)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}>{d.itemName}</span>
                    </>
                  ) : (
                    <span style={{ color: GRADE_COLOR[d.itemGrade] || 'var(--text)', fontWeight: 700 }}>{d.itemName}</span>
                  )}
                  {tags.map((t, ti) => (
                    <span key={ti} style={{
                      fontSize: 10, padding: '1px 5px', marginLeft: 4, borderRadius: 3,
                      background: `${t.color}22`,
                      color: t.color,
                      border: `1px solid ${t.color}`,
                      fontWeight: 700,
                    }}>{t.label}</span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* 강화 기록 */}
        <div style={{
          padding: 14, borderRadius: 8,
          background: 'linear-gradient(135deg, rgba(255,80,80,0.06) 0%, rgba(100,200,100,0.04) 100%)',
          border: '1px solid rgba(255,80,80,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(255,80,80,0.2)' }}>
            <Px src="/images/slots/weapon.png" size={22} />
            <span style={{ fontSize: 14, fontWeight: 900, color: '#ff6b6b', letterSpacing: 1 }}>강화 기록</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>+10 이상</span>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {enhanceLog.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>아직 기록이 없습니다.</div>}
            {enhanceLog.map((e, i) => {
              let resultText: string, resultColor: string;
              if (e.success) { resultText = `+${e.toLevel} 성공!`; resultColor = '#44dd44'; }
              else if (e.destroyed) { resultText = '파괴...'; resultColor = '#ff4444'; }
              else { resultText = `+${e.fromLevel + 1} 실패`; resultColor = '#cc8844'; }
              return (
                <div key={i} style={{ padding: '4px 0', fontSize: 12, borderBottom: i < enhanceLog.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: 10, marginRight: 6 }}>{fmtTime(e.createdAt)}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{e.characterName}</span>
                  {' '}
                  <span style={{ color: GRADE_COLOR[e.itemGrade], fontWeight: 700 }}>{e.itemName}</span>
                  <span style={{ color: 'var(--text-dim)' }}> +{e.fromLevel} → </span>
                  <span style={{
                    fontWeight: 900, color: resultColor,
                    textShadow: e.success ? '0 0 6px rgba(68,221,68,0.4)' : e.destroyed ? '0 0 6px rgba(255,68,68,0.4)' : 'none',
                  }}>{resultText}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 방명록 */}
      <div style={{
        padding: 16, borderRadius: 8, marginBottom: 16,
        background: 'linear-gradient(135deg, rgba(100,140,220,0.06) 0%, rgba(160,120,200,0.04) 100%)',
        border: '1px solid rgba(100,140,220,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(100,140,220,0.15)' }}>
          <Px src="/images/monsters/ghost.png" size={22} />
          <span style={{ fontSize: 15, fontWeight: 900, color: '#7ba4e0', letterSpacing: 1 }}>방명록</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>{guestbook.length}개</span>
        </div>

        {/* 작성 */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 14, padding: 10,
          background: 'rgba(100,140,220,0.06)', borderRadius: 6,
          border: '1px solid rgba(100,140,220,0.12)',
        }}>
          <input
            value={gbText} onChange={e => setGbText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && postGuestbook()}
            placeholder="한마디 남겨보세요... (최대 200자)"
            maxLength={200}
            style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', padding: '8px 12px', fontSize: 13, borderRadius: 4 }}
          />
          <button onClick={postGuestbook} disabled={!gbText.trim()} style={{
            padding: '8px 18px', fontWeight: 700, fontSize: 13,
            background: gbText.trim() ? '#7ba4e0' : 'transparent',
            color: gbText.trim() ? '#000' : 'var(--text-dim)',
            border: `1px solid ${gbText.trim() ? '#7ba4e0' : 'var(--border)'}`,
            borderRadius: 4, cursor: gbText.trim() ? 'pointer' : 'default',
          }}>작성</button>
        </div>
        {gbMsg && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{gbMsg}</div>}

        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {guestbook.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 20 }}>아직 방명록이 비어있습니다. 첫 번째 글을 남겨보세요!</div>}
          {guestbook.map((g, i) => {
            const isOwner = active?.name === g.characterName;
            return (
              <div key={g.id} style={{
                padding: '10px 12px', marginBottom: 6, borderRadius: 6,
                background: i % 2 === 0 ? 'rgba(100,140,220,0.04)' : 'transparent',
                border: '1px solid rgba(100,140,220,0.08)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Px src={`/images/classes/${g.className}.png`} size={18} />
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                      background: `${CLASS_COLOR[g.className] || '#888'}22`,
                      color: CLASS_COLOR[g.className] || '#888',
                      border: `1px solid ${CLASS_COLOR[g.className] || '#888'}44`,
                    }}>{CLASS_LABEL[g.className] || g.className}</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 13 }}>{g.characterName}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>{fmtTime(g.createdAt)}</span>
                    {isOwner && (
                      <button onClick={() => deleteGuestbook(g.id)} style={{
                        fontSize: 10, padding: '1px 6px', color: 'var(--text-dim)',
                        border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer',
                      }}>삭제</button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, paddingLeft: 2 }}>{g.message}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 게임 팁 (접기/펼치기) */}
      <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <button onClick={() => setTipsOpen(!tipsOpen)} style={{
          width: '100%', padding: '12px 16px', background: 'var(--bg-panel)', border: 'none',
          display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left',
        }}>
          <Px src="/images/monsters/guardian.png" size={22} />
          <span style={{ fontWeight: 900, color: 'var(--accent)', fontSize: 14, flex: 1 }}>게임 가이드</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{tipsOpen ? '접기 ▲' : '펼치기 ▼'}</span>
        </button>
        {tipsOpen && (
          <div style={{ padding: 16, background: 'var(--bg-panel)', fontSize: 12, color: 'var(--text-dim)' }}>

            {/* 클래스 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Px src="/images/classes/warrior.png" size={20} />
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>클래스 (4종)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 14 }}>
              {[
                { c: 'warrior', n: '전사', d: '물리 근접 딜탱. 흡혈/강타/수호 계열 스킬 중심' },
                { c: 'mage', n: '마법사', d: '원소 마법 딜러. 동결/기절 게이지 제어 가능' },
                { c: 'cleric', n: '성직자', d: '신성 힐/실드 + 심판 계열 광역 공격' },
                { c: 'rogue', n: '도적', d: '독/연막/백스텝, 빠른 속도와 명중 디버프' },
              ].map(cl => (
                <div key={cl.c} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: 6, background: 'var(--bg)', borderRadius: 4 }}>
                  <Px src={`/images/classes/${cl.c}.png`} size={24} />
                  <div>
                    <div style={{ fontWeight: 700, color: CLASS_COLOR[cl.c], fontSize: 12 }}>{cl.n}</div>
                    <div style={{ fontSize: 11, lineHeight: 1.4 }}>{cl.d}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* 전투 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Px src="/images/monsters/knight.png" size={20} />
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>전투 시스템</span>
            </div>
            <div>· 게이지 기반: SPD가 높을수록 빠르게 행동 (게이지 MAX=1000)</div>
            <div>· 자동/수동 전환 가능, 수동 시 3초 내 스킬 미선택 시 자동 실행</div>
            <div>· 데미지 = (ATK 또는 MATK) × 스킬배율 − (DEF 또는 MDEF × 0.5) ± 10%</div>
            <div>· 회피 상한 30% / 명중 기본 80% + 민첩 보정 (상한 100%)</div>
            <div>· 치명타 상한 100%, 발동 시 데미지 2배</div>
            <div>· CC 면역: 스턴/동결이 성공적으로 걸린 뒤 지속시간 + 3턴 간 추가 CC 차단</div>
            <div>· 사망 시 HP 100% 회복 후 마을 귀환 (패널티 없음)</div>
            <div style={{ marginBottom: 14 }}>· 오프라인 사냥: 최대 24시간, 효율 100%</div>

            {/* 성장 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Px src="/images/monsters/phoenix.png" size={20} />
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>성장</span>
            </div>
            <div>· 최대 레벨 100 · 레벨업 시 HP +25, 노드 포인트 +1, 스탯 포인트 +2</div>
            <div>· <span style={{ color: 'var(--text)' }}>고정 스탯</span>: 전 직업 HP 200, 체력 14, 스피드 200, 치명타 5% 동일 시작</div>
            <div>· 분배 가능 스탯: <span style={{ color: 'var(--text)' }}>힘 / 민첩 / 지능</span> (체력/스피드/치명타는 노드·장비로만 상승)</div>
            <div>· 노드 트리: 302개 노드, 5개 구역 (기본/공격/유틸/중앙/직업)</div>
            <div style={{ marginBottom: 14 }}>· 상위 노드 클릭 시 하위 선행 노드 자동 습득</div>

            {/* 장비 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Px src="/images/slots/weapon.png" size={20} />
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>장비 & 강화</span>
            </div>
            <div>· 장착 부위: 무기/투구/갑옷/장화/반지/목걸이 (6슬롯)</div>
            <div>· 등급: <span style={{ color: '#9a8b75' }}>일반</span> / <span style={{ color: '#ff8c2a', fontWeight: 700 }}>유니크</span> (사냥터 드롭)</div>
            <div>· 품질 0~100%: 드롭 시 랜덤 결정, 기본 스탯을 최대 2배까지 증가</div>
            <div>· 접두사 옵션 수: 1옵(90%) / 2옵(9%) / 3옵(1%)</div>
            <div>· 접두사 등급: T1(90%) / T2(9%) / T3(0.9%) / T4(0.1%), 강화당 +5% 수치 상승</div>
            <div>· 강화 공식: +1~3 100% / +4~6 80% / +7~9 50%</div>
            <div>· +10~12 30%(파괴10%) / +13~15 20%(파괴20%)</div>
            <div>· +16~18 10%(파괴30%) / +19~20 5%(파괴40%)</div>
            <div>· 강화당 기본 스탯 +7.5% 스케일링 (최대 +20)</div>
            <div style={{ marginBottom: 14 }}>· 자동분해: 일반 등급 장비 자동 골드 변환</div>

            {/* 유니크 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Px src="/images/skills/spells/starburst.png" size={20} />
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>유니크 아이템</span>
            </div>
            <div>· 11종 유니크가 사냥터별로 드롭 (Lv 5~100 구간)</div>
            <div>· 같은 레벨대 일반 장비의 약 1.5배 능력치 + 고정 특수 옵션</div>
            <div>· 저렙 사냥터일수록 드롭률 ↑ (0.12% → 0.015%)</div>
            <div style={{ marginBottom: 14 }}>· 접두사도 함께 붙으며, 품질/강화 모두 적용</div>

            {/* 길드 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Px src="/images/items/weapon/double_sword.png" size={20} />
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>길드</span>
            </div>
            <div>· 생성 비용 100,000G · 최대 길드 레벨 20 · 멤버 사냥 EXP의 5%가 자동 기여</div>
            <div>· 길드 스킬 4종 (각 최대 10단계): 체력 / 골드 / 경험 / 드랍</div>
            <div>· 일일 기부 한도: 캐릭터당 1,000,000G · 리더만 자금 사용 가능</div>
            <div style={{ marginBottom: 14 }}>· 영토 점령전: 21개 사냥터에서 주 단위 사냥 점수 1위 길드가 점령 → EXP+15% / 드랍+15%</div>

            {/* 기타 콘텐츠 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Px src="/images/monsters/lich.png" size={20} />
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>콘텐츠</span>
            </div>
            <div>· 사냥터: 21개 필드 (Lv 1~100)</div>
            <div>· 일일 임무: 매일 자정(KST) 초기화, 3개 랜덤 배정, 완료 시 EXP/골드/드랍 +50% 3시간 버프 + 찢어진 스크롤 1개</div>
            <div>· 일일 퀘스트: 골드/EXP/찢어진 스크롤 보상 (퀘스트 탭)</div>
            <div>· 월드 보스 / 월드 이벤트 / 레이드 진행 가능</div>
            <div>· 거래소: 즉시 구매가 등록, 수수료 10%, 등록 72시간</div>
            <div>· PvP: ELO 기반 매칭</div>
            <div>· 출석 체크: 매일 랜덤 보상 + 7일 연속 보너스</div>
          </div>
        )}
      </div>
      {/* 피드백/건의 */}
      <div style={{
        padding: 16, borderRadius: 8, marginTop: 16,
        background: 'linear-gradient(135deg, rgba(180,100,60,0.06) 0%, rgba(180,100,60,0.02) 100%)',
        border: '1px solid rgba(180,100,60,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(180,100,60,0.15)' }}>
          <Px src="/images/monsters/goblin.png" size={22} />
          <span style={{ fontSize: 15, fontWeight: 900, color: '#cc8844', letterSpacing: 1 }}>피드백 / 건의</span>
        </div>

        {/* 작성 폼 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {[['bug', '버그'], ['suggestion', '제안'], ['balance', '밸런스'], ['other', '기타']].map(([k, l]) => (
            <button key={k} onClick={() => setFbCategory(k)} style={{
              fontSize: 11, padding: '3px 10px',
              background: fbCategory === k ? '#cc8844' : 'transparent',
              color: fbCategory === k ? '#000' : 'var(--text-dim)',
              border: `1px solid ${fbCategory === k ? '#cc8844' : 'var(--border)'}`,
              cursor: 'pointer', fontWeight: fbCategory === k ? 700 : 400, borderRadius: 3,
            }}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <textarea
            value={fbText} onChange={e => setFbText(e.target.value)}
            placeholder="버그 신고, 개선 제안, 밸런스 의견 등을 자유롭게 작성해주세요..."
            maxLength={1000} rows={2}
            style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', padding: '8px 12px', fontSize: 13, borderRadius: 4, fontFamily: 'inherit', resize: 'vertical' }}
          />
          <button onClick={submitFeedback} disabled={!fbText.trim()} style={{
            padding: '8px 18px', fontWeight: 700, fontSize: 13, alignSelf: 'flex-end',
            background: fbText.trim() ? '#cc8844' : 'transparent',
            color: fbText.trim() ? '#000' : 'var(--text-dim)',
            border: `1px solid ${fbText.trim() ? '#cc8844' : 'var(--border)'}`,
            borderRadius: 4, cursor: fbText.trim() ? 'pointer' : 'default',
          }}>보내기</button>
        </div>
        {fbMsg && <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 8 }}>{fbMsg}</div>}

        {/* 내 건의 목록 */}
        {fbList.length > 0 && (
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>내 건의 내역</div>
            {fbList.map(f => {
              const statusLabel: Record<string, string> = { open: '접수됨', reviewing: '검토 중', resolved: '해결됨', closed: '종료' };
              const statusColor: Record<string, string> = { open: 'var(--text-dim)', reviewing: 'var(--accent)', resolved: 'var(--success)', closed: 'var(--text-dim)' };
              const catLabel: Record<string, string> = { bug: '버그', suggestion: '제안', balance: '밸런스', other: '기타' };
              return (
                <div key={f.id} style={{ padding: '6px 8px', marginBottom: 4, background: 'rgba(0,0,0,0.15)', borderRadius: 4, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ color: '#cc8844', fontWeight: 700 }}>{catLabel[f.category] || f.category}</span>
                    <span style={{ color: statusColor[f.status] || 'var(--text-dim)', fontSize: 11 }}>{statusLabel[f.status] || f.status}</span>
                  </div>
                  <div style={{ color: 'var(--text)', lineHeight: 1.4 }}>{f.text}</div>
                  {f.admin_note && (
                    <div style={{ marginTop: 4, padding: '4px 8px', borderLeft: '2px solid var(--accent)', color: 'var(--accent)', fontSize: 11 }}>
                      운영자: {f.admin_note}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
