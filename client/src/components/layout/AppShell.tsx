import { Link, useLocation } from 'react-router-dom';
import { useCharacterStore } from '../../stores/characterStore';
import { useAuthStore } from '../../stores/authStore';
import { OfflineReportOverlay } from '../ui/OfflineReportOverlay';
import { AnnouncementPopup } from '../ui/AnnouncementPopup';
import { DailyCheckInBanner } from '../ui/DailyCheckInBanner';
import { ChatPanel } from '../chat/ChatPanel';
import { useEffect, useState } from 'react';
import { useMeStore } from '../../stores/meStore';
import { io as socketIo } from 'socket.io-client';

interface NavItem { to: string; label: string; external?: boolean; }
const NAV: NavItem[] = [
  { to: '/village', label: '메인' },
  { to: '/status', label: '상태' },
  { to: '/map', label: '사냥터' },
  { to: '/combat', label: '전투' },
  { to: '/inventory', label: '인벤토리' },
  { to: '/skills', label: '스킬' },
  { to: '/nodes', label: '노드 트리' },
  { to: '/shop', label: '상점' },
  { to: '/enhance', label: '강화' },
  { to: '/craft', label: '제작' },
  { to: '/daily-quests', label: '일일임무' },
  { to: '/marketplace', label: '거래소' },
  { to: '/world-event', label: '월드이벤트' },
  { to: '/guild', label: '길드' },
  { to: '/pvp', label: 'PvP' },
  { to: '/mailbox', label: '우편함' },
  { to: '/ranking', label: '랭킹' },
  { to: 'https://ko-fi.com/dkdak1212', label: '♥ 후원', external: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const active = useCharacterStore((s) => s.activeCharacter);
  const characters = useCharacterStore((s) => s.characters);
  const selectCharacter = useCharacterStore((s) => s.selectCharacter);
  const logout = useAuthStore((s) => s.logout);
  const clearChar = useCharacterStore((s) => s.clear);
  const me = useMeStore((s) => s.me);
  const fetchMe = useMeStore((s) => s.fetch);
  const clearMe = useMeStore((s) => s.clear);
  const token = useAuthStore((s) => s.token);
  const fetchCharacters = useCharacterStore((s) => s.fetchCharacters);
  const [onlineCount, setOnlineCount] = useState(0);
  const [broadcast, setBroadcast] = useState<string | null>(null);
  const [charSwitchOpen, setCharSwitchOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function switchTo(id: number) {
    if (switching || id === active?.id) { setCharSwitchOpen(false); return; }
    setSwitching(true);
    try {
      await selectCharacter(id);
      setCharSwitchOpen(false);
      // 마을로 이동 (다른 페이지에서 변경 시 캐릭터별 데이터 리로드 필요)
      window.location.href = '/village';
    } catch (e) {
      alert(e instanceof Error ? e.message : '캐릭터 변경 실패');
    } finally {
      setSwitching(false);
    }
  }
  useEffect(() => { fetchMe(); }, [fetchMe]);
  // 새로고침 시 저장된 캐릭터 자동 복구
  useEffect(() => {
    if (!active && localStorage.getItem('activeCharacterId')) {
      fetchCharacters().catch(() => {});
    }
  }, []);
  // 접속자 수 실시간 수신
  useEffect(() => {
    if (!token) return;
    const socket = socketIo({ auth: { token }, transports: ['websocket', 'polling'] });
    socket.on('online-count', (count: number) => setOnlineCount(count));
    socket.on('system-broadcast', (data: { text: string; durationMs?: number }) => {
      setBroadcast(data.text);
      setTimeout(() => setBroadcast(null), data.durationMs ?? 60000);
    });
    return () => { socket.disconnect(); };
  }, [token]);

  const showNav = !!active && loc.pathname !== '/characters';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <OfflineReportOverlay />
      <AnnouncementPopup />
      <header
        className="app-header"
        style={{
          padding: '16px 24px',
          borderBottom: '2px solid var(--accent)',
          background: 'linear-gradient(180deg, var(--bg-panel) 0%, var(--bg) 100%)',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* 도트 몬스터 배경 */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          gap: 18, padding: '0 12px', opacity: 0.06, pointerEvents: 'none',
          overflow: 'hidden',
        }}>
          {['dragon', 'phoenix', 'lich', 'titan', 'hydra', 'griffon', 'knight', 'demon', 'guardian', 'manticore', 'boss_dark', 'frost_giant', 'wyvern', 'naga', 'shadow'].map(m => (
            <img key={m} src={`/images/monsters/${m}.png`} alt="" width={48} height={48}
              style={{ imageRendering: 'pixelated', flexShrink: 0 }} />
          ))}
        </div>
        <span onClick={() => window.location.reload()} className="app-title" style={{
          fontSize: 26, fontWeight: 900, color: 'var(--accent)',
          fontFamily: '"Georgia", "Palatino", serif',
          letterSpacing: 3, textShadow: '0 2px 8px rgba(0,0,0,0.6), 0 0 20px rgba(201,162,77,0.3)',
          cursor: 'pointer', position: 'relative', zIndex: 1,
        }}>
          The Last Story
        </span>
        {active && (
          <div className="app-header-stats" style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 15, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 17 }}>
              {(active as any).title && <span style={{ color: '#ffd700', fontSize: 11, marginRight: 4 }}>[{(active as any).title}]</span>}
              {active.name}
            </span>
            <span style={{ color: 'var(--text-dim)' }}>Lv.{active.level}</span>
            <span style={{ color: 'var(--success)', fontWeight: 700 }}>HP {active.hp}/{active.maxHp}</span>
            <span style={{ color: '#e0a040', fontWeight: 700 }}>{active.gold.toLocaleString()}G</span>
            <span style={{ color: '#8b8bef', fontWeight: 700 }}>NP {(active as any).nodePoints ?? 0}</span>
            {active.location?.startsWith('field:') ? (
              <span style={{
                color: '#ff6b6b', fontWeight: 700, fontSize: 13,
                animation: 'blink-status 1s ease-in-out infinite',
              }}>
                사냥 중 — {(active as any).fieldName || ''}
              </span>
            ) : (
              <span style={{
                color: 'var(--text-dim)', fontWeight: 700, fontSize: 13,
                animation: 'blink-status 2s ease-in-out infinite',
              }}>
                대기 중
              </span>
            )}
          </div>
        )}
        <div className="app-header-actions" style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          {onlineCount > 0 && (
            <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 700 }}>
              {onlineCount}명 접속 중
            </span>
          )}
          {me?.isAdmin && (
            <Link to="/admin" style={{
              padding: '4px 10px', fontSize: 12, color: 'var(--danger)',
              border: '1px solid var(--danger)', textDecoration: 'none',
            }}>
              관리자
            </Link>
          )}
          {characters.length > 1 && (
            <button onClick={() => setCharSwitchOpen(true)} style={{
              padding: '3px 10px', fontSize: 11,
              background: 'var(--bg-panel)', color: 'var(--accent)',
              border: '1px solid var(--accent)', fontWeight: 700, cursor: 'pointer',
            }}>캐릭터 변경</button>
          )}
          <button onClick={() => { clearChar(); clearMe(); logout(); }} style={{ padding: '2px 8px', fontSize: 10 }}>로그아웃</button>
        </div>
      </header>

      {charSwitchOpen && (
        <div onClick={() => setCharSwitchOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-panel)', border: '2px solid var(--accent)',
            borderRadius: 6, padding: 16, width: 'min(420px, 92vw)',
            maxHeight: '85vh', overflow: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: 'var(--accent)', fontSize: 16 }}>캐릭터 변경</h3>
              <button onClick={() => setCharSwitchOpen(false)} style={{ fontSize: 11 }}>닫기</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10 }}>
              계정 내 캐릭터 목록 · 클릭하여 즉시 전환
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {characters.map(c => {
                const isActive = c.id === active?.id;
                const classColor: Record<string, string> = {
                  warrior: '#e04040', mage: '#4080e0', cleric: '#daa520', rogue: '#a060c0',
                };
                const classLabel: Record<string, string> = {
                  warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적',
                };
                const cls = (c as any).className || (c as any).class_name || '';
                return (
                  <button key={c.id} disabled={switching || isActive} onClick={() => switchTo(c.id)} style={{
                    padding: '10px 12px',
                    background: isActive ? 'rgba(218,165,32,0.12)' : 'var(--bg)',
                    border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                    borderLeft: `3px solid ${classColor[cls] || 'var(--border)'}`,
                    borderRadius: 3, cursor: isActive || switching ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    textAlign: 'left',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        {c.name}
                        {isActive && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)' }}>● 현재</span>}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                        Lv.{c.level} {classLabel[cls] || cls}
                      </div>
                    </div>
                    {!isActive && <span style={{ fontSize: 10, color: 'var(--accent)' }}>전환 →</span>}
                  </button>
                );
              })}
            </div>
            {switching && (
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
                전환 중...
              </div>
            )}
          </div>
        </div>
      )}

      {broadcast && (
        <div style={{
          background: 'linear-gradient(90deg, #1a0800, #2a1000, #1a0800)',
          borderBottom: '2px solid #ff8800',
          padding: '6px 0',
          overflow: 'hidden',
          position: 'relative',
          width: '100%',
        }}>
          <div style={{
            display: 'inline-block',
            whiteSpace: 'nowrap',
            animation: 'marquee-scroll 10s linear infinite',
            fontSize: 14,
            fontWeight: 700,
            color: '#ff8800',
          }}>
            {'\u{1F4E2} [시스템 공지] ' + broadcast}
          </div>
          <style>{`@keyframes marquee-scroll { 0% { transform: translateX(100vw); } 100% { transform: translateX(-100%); } }
@keyframes blink-status { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
        </div>
      )}

      {showNav && (
        <nav
          className="app-nav"
          style={{
            display: 'flex',
            padding: 0,
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-panel)',
          }}
        >
          {NAV.map((n) => {
            if (n.external) {
              return (
                <a
                  key={n.to}
                  href={n.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    fontSize: 12,
                    textAlign: 'center',
                    color: 'var(--text-dim)',
                    textDecoration: 'none',
                    borderRight: '1px solid var(--border)',
                    background: 'transparent',
                    fontWeight: 400,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {n.label}
                </a>
              );
            }
            return (
              <Link
                key={n.to}
                to={n.to}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  fontSize: 12,
                  textAlign: 'center',
                  color: loc.pathname === n.to ? 'var(--accent)' : 'var(--text-dim)',
                  textDecoration: 'none',
                  borderRight: '1px solid var(--border)',
                  background: loc.pathname === n.to ? 'rgba(201,162,77,0.1)' : 'transparent',
                  fontWeight: loc.pathname === n.to ? 700 : 400,
                  whiteSpace: 'nowrap',
                }}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      )}

      <div style={{ display: 'flex', flex: 1 }}>
        {/* 왼쪽 사이드 장식 */}
        <aside className="app-side-decor" style={{
          width: 28, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          background: 'linear-gradient(180deg, var(--bg-panel) 0%, transparent 30%)',
        }}>
          <div style={{ width: 1, height: 20 }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', opacity: 0.5 }} />
          <div style={{ width: 1, flex: 1, background: 'linear-gradient(180deg, var(--accent-dim) 0%, transparent 60%)' }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', opacity: 0.2, marginBottom: 20 }} />
        </aside>

        {/* 메인 콘텐츠 */}
        <div className="app-main-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {showNav && <div className="app-daily-banner" style={{ maxWidth: 1200, width: '100%', margin: '10px auto 0', padding: '0 20px' }}><DailyCheckInBanner /></div>}
          <main className="app-main" style={{ flex: 1, padding: 20, paddingBottom: 60, maxWidth: 1200, width: '100%', margin: '0 auto' }}>
            {children}
          </main>
        </div>

        {/* 오른쪽 사이드 장식 */}
        <aside className="app-side-decor" style={{
          width: 28, flexShrink: 0,
          borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          background: 'linear-gradient(180deg, var(--bg-panel) 0%, transparent 30%)',
        }}>
          <div style={{ width: 1, height: 20 }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', opacity: 0.5 }} />
          <div style={{ width: 1, flex: 1, background: 'linear-gradient(180deg, var(--accent-dim) 0%, transparent 60%)' }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', opacity: 0.2, marginBottom: 20 }} />
        </aside>
      </div>
      {showNav && <ChatPanel />}
    </div>
  );
}
