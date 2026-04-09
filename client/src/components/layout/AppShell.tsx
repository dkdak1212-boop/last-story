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

const NAV = [
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
  { to: '/quests', label: '퀘스트' },
  { to: '/marketplace', label: '경매소' },
  { to: '/world-event', label: '월드이벤트' },
  { to: '/guild', label: '길드' },
  { to: '/pvp', label: 'PvP' },
  { to: '/premium', label: '프리미엄' },
  { to: '/mailbox', label: '우편함' },
  { to: '/ranking', label: '랭킹' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const active = useCharacterStore((s) => s.activeCharacter);
  const logout = useAuthStore((s) => s.logout);
  const clearChar = useCharacterStore((s) => s.clear);
  const me = useMeStore((s) => s.me);
  const fetchMe = useMeStore((s) => s.fetch);
  const clearMe = useMeStore((s) => s.clear);
  const token = useAuthStore((s) => s.token);
  const fetchCharacters = useCharacterStore((s) => s.fetchCharacters);
  const [onlineCount, setOnlineCount] = useState(0);
  const [broadcast, setBroadcast] = useState<string | null>(null);
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
    socket.on('system-broadcast', (data: { text: string }) => {
      setBroadcast(data.text);
      setTimeout(() => setBroadcast(null), 60000);
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
            <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 17 }}>{active.name}</span>
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
          {active && (
            <span style={{ fontSize: 10, color: '#e0a040', background: 'rgba(224,160,64,0.1)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(224,160,64,0.3)' }}>
              경험치+50% 드롭률+50% (온라인)
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
          <button onClick={() => { clearChar(); clearMe(); logout(); }} style={{ padding: '2px 8px', fontSize: 10 }}>로그아웃</button>
        </div>
      </header>

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
            gap: 4,
            padding: '8px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-panel)',
          }}
        >
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              style={{
                padding: '6px 14px',
                color: loc.pathname === n.to ? 'var(--accent)' : 'var(--text-dim)',
                textDecoration: 'none',
                borderBottom:
                  loc.pathname === n.to ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              {n.label}
            </Link>
          ))}
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
