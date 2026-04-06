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
  { to: '/village', label: '마을' },
  { to: '/status', label: '상태' },
  { to: '/map', label: '지도' },
  { to: '/combat', label: '전투' },
  { to: '/inventory', label: '인벤토리' },
  { to: '/skills', label: '스킬' },
  { to: '/shop', label: '상점' },
  { to: '/enhance', label: '강화' },
  { to: '/quests', label: '퀘스트' },
  { to: '/marketplace', label: '경매소' },
  { to: '/guild', label: '길드' },
  { to: '/party', label: '파티' },
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
  useEffect(() => { fetchMe(); }, [fetchMe]);

  const showNav = !!active && loc.pathname !== '/characters';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <OfflineReportOverlay />
      <AnnouncementPopup />
      <header
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
          마지막이야기
        </div>
        {active && (
          <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>
            {active.name} · Lv.{active.level} {active.className} · HP {active.hp}/{active.maxHp} · MP {active.mp}/{active.maxMp} · {active.gold}G
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
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

      {showNav && <div style={{ maxWidth: 1200, width: '100%', margin: '10px auto 0' }}><DailyCheckInBanner /></div>}
      <main style={{ flex: 1, padding: 20, paddingBottom: 60, maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        {children}
      </main>
      {showNav && <ChatPanel />}
    </div>
  );
}
