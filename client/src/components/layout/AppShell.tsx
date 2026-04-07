import { Link, useLocation } from 'react-router-dom';
import { useCharacterStore } from '../../stores/characterStore';
import { useAuthStore } from '../../stores/authStore';
import { OfflineReportOverlay } from '../ui/OfflineReportOverlay';
import { AnnouncementPopup } from '../ui/AnnouncementPopup';
import { DailyCheckInBanner } from '../ui/DailyCheckInBanner';
import { ChatPanel } from '../chat/ChatPanel';
import { useEffect } from 'react';
import { useMeStore } from '../../stores/meStore';

const NAV = [
  { to: '/village', label: '메인' },
  { to: '/status', label: '상태' },
  { to: '/map', label: '사냥터' },
  { to: '/combat', label: '전투' },
  { to: '/world-event', label: '월드이벤트' },
  { to: '/inventory', label: '인벤토리' },
  { to: '/skills', label: '스킬' },
  { to: '/nodes', label: '노드 트리' },
  { to: '/shop', label: '상점' },
  { to: '/enhance', label: '강화' },
  { to: '/quests', label: '퀘스트' },
  { to: '/marketplace', label: '경매소' },
  { to: '/guild', label: '길드' },
  { to: '/pvp', label: 'PvP' },
  { to: '/premium', label: '프리미엄' },
  { to: '/mailbox', label: '우편함' },
  { to: '/ranking', label: '랭킹' },
  { to: '/announcements', label: '공지' },
  { to: '/feedback', label: '피드백' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const active = useCharacterStore((s) => s.activeCharacter);
  const logout = useAuthStore((s) => s.logout);
  const clearChar = useCharacterStore((s) => s.clear);
  const me = useMeStore((s) => s.me);
  const fetchMe = useMeStore((s) => s.fetch);
  const clearMe = useMeStore((s) => s.clear);
  const fetchCharacters = useCharacterStore((s) => s.fetchCharacters);
  useEffect(() => { fetchMe(); }, [fetchMe]);
  // 새로고침 시 저장된 캐릭터 자동 복구
  useEffect(() => {
    if (!active && localStorage.getItem('activeCharacterId')) {
      fetchCharacters().catch(() => {});
    }
  }, []);

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
        }}
      >
        <Link to="/village" className="app-title" style={{
          fontSize: 26, fontWeight: 900, color: 'var(--accent)',
          fontFamily: '"Georgia", "Palatino", serif',
          letterSpacing: 2, textShadow: '0 1px 4px rgba(0,0,0,0.4)',
          textDecoration: 'none',
        }}>
          마지막이야기
        </Link>
        {active && (
          <div className="app-header-stats" style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 15, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 17 }}>{active.name}</span>
            <span style={{ color: 'var(--text-dim)' }}>Lv.{active.level}</span>
            <span style={{ color: 'var(--success)', fontWeight: 700 }}>HP {active.hp}/{active.maxHp}</span>
            <span style={{ color: '#e0a040', fontWeight: 700 }}>{active.gold.toLocaleString()}G</span>
            <span style={{ color: '#8b8bef', fontWeight: 700 }}>NP {(active as any).nodePoints ?? 0}</span>
          </div>
        )}
        <div className="app-header-actions" style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {me?.isAdmin && (
            <Link to="/admin" style={{
              padding: '4px 10px', fontSize: 12, color: 'var(--danger)',
              border: '1px solid var(--danger)', textDecoration: 'none',
            }}>
              관리자
            </Link>
          )}
          <button onClick={() => { clearChar(); clearMe(); logout(); }}>로그아웃</button>
        </div>
      </header>

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
          width: 60, flexShrink: 0,
          background: 'linear-gradient(180deg, var(--bg-panel) 0%, transparent 40%)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20, gap: 14,
          opacity: 0.7,
        }}>
          {['warrior', 'mage', 'cleric', 'rogue'].map((c) => (
            <img key={c} src={`/images/classes/${c}.png`} alt={c} width={32} height={32}
              style={{ imageRendering: 'pixelated', opacity: 0.8 }} />
          ))}
          <div style={{
            width: 2, flex: 1, marginTop: 8,
            background: 'linear-gradient(180deg, var(--accent-dim) 0%, transparent 100%)',
          }} />
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
          width: 60, flexShrink: 0,
          background: 'linear-gradient(180deg, var(--bg-panel) 0%, transparent 40%)',
          borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20, gap: 14,
          opacity: 0.7,
        }}>
          {['dragon', 'titan', 'hydra', 'griffon', 'lich', 'phoenix', 'manticore', 'boss_dark'].map((m) => (
            <img key={m} src={`/images/monsters/${m}.png`} alt={m} width={32} height={32}
              style={{ imageRendering: 'pixelated', opacity: 0.8 }} />
          ))}
          <div style={{
            width: 2, flex: 1, marginTop: 8,
            background: 'linear-gradient(180deg, var(--accent-dim) 0%, transparent 100%)',
          }} />
        </aside>
      </div>
      {showNav && <ChatPanel />}
    </div>
  );
}
