import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, Component, type ReactNode, useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { AppShell } from './components/layout/AppShell';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { MaintenanceScreen } from './components/ui/MaintenanceScreen';

// lazy import에 자동 재시도 (chunk 로드 실패 대응)
function lazyRetry(factory: () => Promise<any>, retries = 3): ReturnType<typeof lazy> {
  return lazy(() =>
    factory().catch((err) => {
      if (retries > 0) {
        return new Promise<any>((resolve) => setTimeout(resolve, 500)).then(() => lazyRetry(factory, retries - 1));
      }
      // 최종 실패 시 페이지 새로고침 (배포 후 chunk 해시 변경 대응)
      window.location.reload();
      throw err;
    })
  );
}

const LoginScreen = lazyRetry(() => import('./screens/LoginScreen').then((m) => ({ default: m.LoginScreen })));
const CharacterSelectScreen = lazyRetry(() => import('./screens/CharacterSelectScreen').then((m) => ({ default: m.CharacterSelectScreen })));
const VillageScreen = lazyRetry(() => import('./screens/VillageScreen').then((m) => ({ default: m.VillageScreen })));
const MapScreen = lazyRetry(() => import('./screens/MapScreen').then((m) => ({ default: m.MapScreen })));
const CombatScreen = lazyRetry(() => import('./screens/CombatScreen').then((m) => ({ default: m.CombatScreen })));
const InventoryScreen = lazyRetry(() => import('./screens/InventoryScreen').then((m) => ({ default: m.InventoryScreen })));
const SkillsScreen = lazyRetry(() => import('./screens/SkillsScreen').then((m) => ({ default: m.SkillsScreen })));
const ShopScreen = lazyRetry(() => import('./screens/ShopScreen').then((m) => ({ default: m.ShopScreen })));
const MailboxScreen = lazyRetry(() => import('./screens/MailboxScreen').then((m) => ({ default: m.MailboxScreen })));
const RankingScreen = lazyRetry(() => import('./screens/RankingScreen').then((m) => ({ default: m.RankingScreen })));
const GuildScreen = lazyRetry(() => import('./screens/GuildScreen').then((m) => ({ default: m.GuildScreen })));
const GuildBossScreen = lazyRetry(() => import('./screens/GuildBossScreen').then((m) => ({ default: m.GuildBossScreen })));
const GuildBossShopScreen = lazyRetry(() => import('./screens/GuildBossShopScreen').then((m) => ({ default: m.GuildBossShopScreen })));
const NodeTreeScreen = lazyRetry(() => import('./screens/NodeTreeScreen').then((m) => ({ default: m.NodeTreeScreen })));
const MarketplaceScreen = lazyRetry(() => import('./screens/MarketplaceScreen').then((m) => ({ default: m.MarketplaceScreen })));
const PvPScreen = lazyRetry(() => import('./screens/PvPScreen').then((m) => ({ default: m.PvPScreen })));
const PvPCombatScreen = lazyRetry(() => import('./screens/PvPCombatScreen').then((m) => ({ default: m.PvPCombatScreen })));
const AnnouncementScreen = lazyRetry(() => import('./screens/AnnouncementScreen').then((m) => ({ default: m.AnnouncementScreen })));
const FeedbackScreen = lazyRetry(() => import('./screens/FeedbackScreen').then((m) => ({ default: m.FeedbackScreen })));
const AdminScreen = lazyRetry(() => import('./screens/AdminScreen').then((m) => ({ default: m.AdminScreen })));
const StatusScreen = lazyRetry(() => import('./screens/StatusScreen').then((m) => ({ default: m.StatusScreen })));
const EnhanceScreen = lazyRetry(() => import('./screens/EnhanceScreen').then((m) => ({ default: m.EnhanceScreen })));
const CraftScreen = lazyRetry(() => import('./screens/CraftScreen').then((m) => ({ default: m.CraftScreen })));
const WorldEventScreen = lazyRetry(() => import('./screens/WorldEventScreen').then((m) => ({ default: m.WorldEventScreen })));

const DailyQuestScreen = lazyRetry(() => import('./screens/DailyQuestScreen').then((m) => ({ default: m.DailyQuestScreen })));
const AchievementScreen = lazyRetry(() => import('./screens/AchievementScreen').then((m) => ({ default: m.AchievementScreen })));

// 에러 바운더리: 렌더 에러 시 검은화면 대신 복구 UI
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#ccc' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>화면 로딩 오류</div>
          <div style={{ fontSize: 14, color: '#888', marginBottom: 20 }}>페이지를 불러오지 못했습니다.</div>
          <button onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            style={{ padding: '10px 24px', fontSize: 14, fontWeight: 700, background: '#daa520', color: '#000', border: 'none', cursor: 'pointer' }}>
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Protected({ children }: { children: React.ReactNode }) {
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  if (!isAuth) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function MaintenanceGate({ children }: { children: ReactNode }) {
  const isAdmin = useAuthStore((s) => s.username === 'admin');
  const [until, setUntil] = useState<string | null>(null);

  const check = async () => {
    try {
      // 3초 타임아웃 — 응답 없으면 정상 모드로 간주
      const ctl = new AbortController();
      const tid = setTimeout(() => ctl.abort(), 3000);
      const res = await fetch('/api/server-status', { signal: ctl.signal });
      clearTimeout(tid);
      if (!res.ok) throw new Error('not ok');
      const s = await res.json() as { maintenance: boolean; until: string | null };
      setUntil(s.maintenance && s.until ? s.until : null);
    } catch {
      setUntil(null);
    }
  };
  useEffect(() => {
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, []);

  // checked 플래그 제거: 로딩 중에도 children 렌더 (점검 중이면 즉시 화면 교체)
  if (until && !isAdmin) return <MaintenanceScreen until={until} onRetry={check} />;
  return <>{children}</>;
}

function OAuthTokenCapture() {
  const loginWithToken = useAuthStore((s) => s.loginWithToken);
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#oauth_token=')) {
      const token = decodeURIComponent(hash.replace('#oauth_token=', ''));
      if (token) {
        // 탈퇴 플로우: 토큰을 받자마자 /me/delete 호출 후 로그아웃
        const deleteMode = sessionStorage.getItem('deleteAccountOnLogin');
        if (deleteMode === '1') {
          sessionStorage.removeItem('deleteAccountOnLogin');
          history.replaceState(null, '', window.location.pathname);
          (async () => {
            try {
              const resp = await fetch(`/api/me/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ confirm: 'DELETE_MY_ACCOUNT' }),
              });
              const data = await resp.json().catch(() => ({}));
              if (resp.ok) alert(`회원 탈퇴가 완료되었습니다.\n계정: ${data.deletedUser}\n모든 데이터가 영구 삭제되었습니다.`);
              else alert(`탈퇴 실패: ${data.error || resp.status}`);
            } catch (e) {
              alert('탈퇴 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
            }
            try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
            window.location.href = '/';
          })();
          return;
        }

        loginWithToken(token);
        // 해시 제거
        history.replaceState(null, '', window.location.pathname);
      }
    }
    const qs = new URLSearchParams(window.location.search);
    const err = qs.get('oauth_error');
    if (err) {
      const msg = err === 'blocked' ? 'IP가 차단된 상태입니다'
        : err === 'banned' ? '계정이 정지되었습니다'
        : err === 'token_exchange' ? 'Google 인증 토큰 교환 실패'
        : err === 'userinfo' ? 'Google 사용자 정보 조회 실패'
        : `OAuth 오류: ${err}`;
      alert(msg);
      history.replaceState(null, '', window.location.pathname);
    }
  }, [loginWithToken]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <OAuthTokenCapture />
        <Suspense fallback={<LoadingSpinner message="불러오는 중..." />}>
          <MaintenanceGate>
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route
              path="/*"
              element={
                <Protected>
                  <AppShell>
                    <Routes>
                      <Route path="/" element={<Navigate to="/characters" replace />} />
                      <Route path="/characters" element={<CharacterSelectScreen />} />
                      <Route path="/village" element={<VillageScreen />} />
                      <Route path="/map" element={<MapScreen />} />
                      <Route path="/combat" element={<CombatScreen />} />
                      <Route path="/inventory" element={<InventoryScreen />} />
                      <Route path="/skills" element={<SkillsScreen />} />
                      <Route path="/shop" element={<ShopScreen />} />
                      <Route path="/mailbox" element={<MailboxScreen />} />
                      <Route path="/ranking" element={<RankingScreen />} />
                      <Route path="/guild" element={<GuildScreen />} />
                      <Route path="/guild-boss" element={<GuildBossScreen />} />
                      <Route path="/guild-boss-shop" element={<GuildBossShopScreen />} />
                      <Route path="/nodes" element={<NodeTreeScreen />} />
                      <Route path="/marketplace" element={<MarketplaceScreen />} />
                      <Route path="/pvp" element={<PvPScreen />} />
                      <Route path="/pvp-combat/:battleId" element={<PvPCombatScreen />} />
                      <Route path="/announcements" element={<AnnouncementScreen />} />
                      <Route path="/daily-quests" element={<DailyQuestScreen />} />
                      <Route path="/achievements" element={<AchievementScreen />} />
                      <Route path="/feedback" element={<FeedbackScreen />} />
                      <Route path="/admin" element={<AdminScreen />} />
                      <Route path="/status" element={<StatusScreen />} />
                      <Route path="/enhance" element={<EnhanceScreen />} />
                      <Route path="/craft" element={<CraftScreen />} />
                      <Route path="/world-event" element={<WorldEventScreen />} />
                    </Routes>
                  </AppShell>
                </Protected>
              }
            />
          </Routes>
          </MaintenanceGate>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
