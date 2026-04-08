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

export function VillageScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refresh = useCharacterStore((s) => s.refreshActive);
  const [dropLog, setDropLog] = useState<DropLog[]>([]);
  const [enhanceLog, setEnhanceLog] = useState<EnhanceLog[]>([]);
  const [guestbook, setGuestbook] = useState<GuestbookEntry[]>([]);
  const [gbMsg, setGbMsg] = useState('');
  const [gbText, setGbText] = useState('');
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
    loadGuestbook();
  }, [refresh]);

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
    try {
      await api(`/guestbook/${id}/delete`, { method: 'POST' });
      loadGuestbook();
    } catch {}
  }

  return (
    <div>
      {/* BGM 컨트롤 */}
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

      {/* 두 로그 패널 (가로 2열) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        {/* 아이템 드롭 축하 */}
        <div style={{
          padding: 14, borderRadius: 8,
          background: 'linear-gradient(135deg, rgba(224,128,48,0.06) 0%, rgba(176,96,204,0.04) 100%)',
          border: '1px solid rgba(224,128,48,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(224,128,48,0.2)' }}>
            <span style={{ fontSize: 18 }}>&#127775;</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: '#e08030', letterSpacing: 1 }}>드롭 축하</span>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {dropLog.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>아직 기록이 없습니다.</div>}
            {dropLog.map((d, i) => {
              const time = new Date(d.createdAt);
              const timeStr = `${time.getMonth() + 1}/${time.getDate()} ${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
              const reason = d.itemGrade === 'legendary' && d.prefixCount >= 3 ? '전설 3옵' : d.itemGrade === 'legendary' ? '전설' : `${d.prefixCount}옵`;
              return (
                <div key={i} style={{ padding: '4px 0', fontSize: 12, borderBottom: i < dropLog.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: 10, marginRight: 6 }}>{timeStr}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{d.characterName}</span>
                  <span style={{ color: 'var(--text-dim)' }}> </span>
                  <span style={{ color: GRADE_COLOR[d.itemGrade], fontWeight: 700 }}>{d.itemName}</span>
                  <span style={{
                    fontSize: 10, padding: '1px 5px', marginLeft: 4,
                    background: d.itemGrade === 'legendary' ? 'rgba(224,128,48,0.15)' : 'rgba(176,96,204,0.15)',
                    color: d.itemGrade === 'legendary' ? '#e08030' : '#b060cc',
                    border: `1px solid ${d.itemGrade === 'legendary' ? '#e08030' : '#b060cc'}`,
                    borderRadius: 3,
                  }}>{reason}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 강화 로그 */}
        <div style={{
          padding: 14, borderRadius: 8,
          background: 'linear-gradient(135deg, rgba(255,80,80,0.06) 0%, rgba(100,200,100,0.04) 100%)',
          border: '1px solid rgba(255,80,80,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(255,80,80,0.2)' }}>
            <span style={{ fontSize: 18 }}>&#9876;</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: '#ff6b6b', letterSpacing: 1 }}>강화 기록</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>+10 이상</span>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {enhanceLog.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>아직 기록이 없습니다.</div>}
            {enhanceLog.map((e, i) => {
              const time = new Date(e.createdAt);
              const timeStr = `${time.getMonth() + 1}/${time.getDate()} ${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
              let resultText: string;
              let resultColor: string;
              if (e.success) {
                resultText = `+${e.toLevel} 성공!`;
                resultColor = '#44dd44';
              } else if (e.destroyed) {
                resultText = '파괴...';
                resultColor = '#ff4444';
              } else {
                resultText = `+${e.fromLevel + 1} 실패`;
                resultColor = '#cc8844';
              }
              return (
                <div key={i} style={{ padding: '4px 0', fontSize: 12, borderBottom: i < enhanceLog.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: 10, marginRight: 6 }}>{timeStr}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{e.characterName}</span>
                  <span style={{ color: 'var(--text-dim)' }}> </span>
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
          <span style={{ fontSize: 20 }}>&#128221;</span>
          <span style={{ fontSize: 15, fontWeight: 900, color: '#7ba4e0', letterSpacing: 1 }}>방명록</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>{guestbook.length}개</span>
        </div>

        {/* 작성 폼 */}
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
          }}>
            작성
          </button>
        </div>
        {gbMsg && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{gbMsg}</div>}

        {/* 목록 */}
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {guestbook.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 20 }}>아직 방명록이 비어있습니다. 첫 번째 글을 남겨보세요!</div>}
          {guestbook.map((g, i) => {
            const time = new Date(g.createdAt);
            const timeStr = `${time.getMonth() + 1}/${time.getDate()} ${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
            const isOwner = active?.name === g.characterName;
            return (
              <div key={g.id} style={{
                padding: '10px 12px', marginBottom: 6, borderRadius: 6,
                background: i % 2 === 0 ? 'rgba(100,140,220,0.04)' : 'transparent',
                border: '1px solid rgba(100,140,220,0.08)',
                transition: 'background 0.2s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                      background: `${CLASS_COLOR[g.className] || '#888'}22`,
                      color: CLASS_COLOR[g.className] || '#888',
                      border: `1px solid ${CLASS_COLOR[g.className] || '#888'}44`,
                    }}>
                      {CLASS_LABEL[g.className] || g.className}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 13 }}>{g.characterName}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>{timeStr}</span>
                    {isOwner && (
                      <button onClick={() => deleteGuestbook(g.id)} style={{
                        fontSize: 10, padding: '1px 6px', color: 'var(--text-dim)',
                        border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer',
                      }}>삭제</button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, paddingLeft: 2 }}>
                  {g.message}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 게임 팁 */}
      <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-dim)' }}>
        <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 10, fontSize: 14 }}>게임 팁</div>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>전투</div>
        <div>· 전투는 자동 진행, 스킬/포션도 자동 사용</div>
        <div>· 사망 시 패널티 없이 HP 25% 회복 후 마을 귀환</div>
        <div style={{ marginBottom: 10 }}>· 오프라인 중에도 사냥 진행 (최대 24시간, 효율 90%)</div>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>장비</div>
        <div>· 드롭 시 랜덤 접두사 부여 (1옵 90%, 2옵 9%, 3옵 1%)</div>
        <div>· 강화 +10 이후 실패 시 파괴 가능! 스크롤로 성공률 +10%</div>
        <div style={{ marginBottom: 10 }}>· 최대 +20강, 자동분해 설정으로 일반 장비 자동 골드 변환</div>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>노드 트리</div>
        <div>· 레벨당 2포인트 획득, 302개 노드 중 전략적 선택</div>
        <div style={{ marginBottom: 10 }}>· 4포인트 노드는 하위 노드 자동 습득</div>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>기타</div>
        <div>· 출석 체크: 매일 랜덤 상자, 7일 연속 보너스</div>
        <div>· 월드 보스: 하루 2회, 기여도 순 보상</div>
        <div>· 길드 가입 시 전투 능력치 +5%</div>
      </div>
    </div>
  );
}
