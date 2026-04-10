import { useEffect, useState, useRef } from 'react';
import { useCharacterStore } from '../stores/characterStore';
import { api } from '../api/client';

interface DropLog {
  characterName: string;
  itemName: string;
  itemGrade: string;
  prefixCount: number;
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
  warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적',
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

  // BGM
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio('/bgm.mp3');
      audio.loop = true;
      audio.volume = bgmVolume;
      audioRef.current = audio;
      audio.play().then(() => setBgmPlaying(true)).catch(() => {});
    }
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = bgmVolume;
      localStorage.setItem('bgmVolume', String(bgmVolume));
    }
  }, [bgmVolume]);

  function toggleBgm() {
    if (!audioRef.current) return;
    if (bgmPlaying) { audioRef.current.pause(); setBgmPlaying(false); }
    else { audioRef.current.play().then(() => setBgmPlaying(true)).catch(() => {}); }
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
              const reason = d.itemGrade === 'legendary' && d.prefixCount >= 3 ? '전설 3옵' : d.itemGrade === 'legendary' ? '전설' : `${d.prefixCount}옵`;
              return (
                <div key={i} style={{ padding: '4px 0', fontSize: 12, borderBottom: i < dropLog.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: 10, marginRight: 6 }}>{fmtTime(d.createdAt)}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{d.characterName}</span>
                  {' '}
                  <span style={{ color: GRADE_COLOR[d.itemGrade], fontWeight: 700 }}>{d.itemName}</span>
                  <span style={{
                    fontSize: 10, padding: '1px 5px', marginLeft: 4, borderRadius: 3,
                    background: d.itemGrade === 'legendary' ? 'rgba(224,128,48,0.15)' : 'rgba(176,96,204,0.15)',
                    color: d.itemGrade === 'legendary' ? '#e08030' : '#b060cc',
                    border: `1px solid ${d.itemGrade === 'legendary' ? '#e08030' : '#b060cc'}`,
                  }}>{reason}</span>
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
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>클래스</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 14 }}>
              {[
                { c: 'warrior', n: '전사', d: '힘15 체14 속300 — 물리 딜러, 흡혈 참격으로 생존' },
                { c: 'mage', n: '마법사', d: '지16 체10 속300 — 원소 파괴, 게이지 제어, 높은 마법배율' },
                { c: 'cleric', n: '성직자', d: '지14 체12 속250 — 힐/실드 + 심판 공격' },
                { c: 'rogue', n: '도적', d: '민14 치8% 속350 — 독/연쇄, 빠른 속도' },
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
            <div>· 게이지 기반: 속도(SPD)가 높을수록 빠르게 행동 (게이지 MAX=1000)</div>
            <div>· 자동/수동 전환 가능, 수동 시 3초 내 스킬 미선택 시 자동 행동</div>
            <div>· 데미지 = (ATK 또는 MATK) - (DEF 또는 MDEF x 0.5), 크리 2배</div>
            <div>· 회피 최대 30%, 명중 기본 80% + 민첩 보정</div>
            <div>· 사망 시 HP 25% 회복 후 마을 귀환 (패널티 없음)</div>
            <div style={{ marginBottom: 14 }}>· 오프라인 사냥: 최대 24시간, 효율 90%</div>

            {/* 성장 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Px src="/images/monsters/phoenix.png" size={20} />
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>성장</span>
            </div>
            <div>· 최대 레벨: 100 | 레벨당 +8 HP, +2 노드 포인트</div>
            <div>· 스탯 성장: 전사(힘+2/체+1.5) 마법사(지+2) 도적(민+1.5/속+3)</div>
            <div>· 노드 트리: 302개 노드, 5개 구역 (기본/공격/유틸/중앙/직업)</div>
            <div style={{ marginBottom: 14 }}>· 4포인트 노드: 투자 시 하위 선행 노드 자동 습득</div>

            {/* 장비 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Px src="/images/slots/weapon.png" size={20} />
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>장비 & 강화</span>
            </div>
            <div>· 장착 부위: 무기/투구/갑옷/장화/반지/목걸이 (6슬롯)</div>
            <div>· 등급: <span style={{ color: '#9a8b75' }}>일반</span> / <span style={{ color: '#5b8ecc' }}>매직</span> / <span style={{ color: '#b060cc' }}>에픽</span> / <span style={{ color: '#e08030' }}>전설</span></div>
            <div>· 접두사: 1옵(90%) / 2옵(9%) / 3옵(1%), 등급 1~4단계</div>
            <div>· 강화: +1~3 100% | +4~6 80% | +7~9 50%</div>
            <div>· +10~12 30% (파괴10%) | +13~15 20% (파괴20%)</div>
            <div>· +16~18 10% (파괴30%) | +19~20 5% (파괴40%)</div>
            <div>· 강화 스크롤: 성공률 +10% (소비 아이템)</div>
            <div style={{ marginBottom: 14 }}>· 자동분해: 일반 등급 장비 자동 골드 변환</div>

            {/* 기타 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Px src="/images/monsters/lich.png" size={20} />
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>콘텐츠</span>
            </div>
            <div>· 사냥터: 21개 필드 (Lv.1~70), 36종 몬스터 (보스 5종)</div>
            <div>· 스킬: 클래스당 7개, 레벨 도달 시 자동 습득 (최대 6개 자동)</div>
            <div>· 월드 보스: 하루 2회, 기여도 순위별 S/A/B/C 등급 보상</div>
            <div>· 길드: 가입 시 전체 전투 스탯 +5% 버프</div>
            <div>· 거래소: 즉시 구매가 등록, 수수료 10%, 등록 72시간</div>
            <div>· PvP: 하루 10회, ELO 기반 매칭</div>
            <div>· 출석 체크: 매일 랜덤 상자 (전설 2%), 7일 연속 보너스</div>
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
