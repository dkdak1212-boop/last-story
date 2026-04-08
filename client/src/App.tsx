import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, Component, type ReactNode } from 'react';
import { useAuthStore } from './stores/authStore';
import { AppShell } from './components/layout/AppShell';
import { LoadingSpinner } from './components/ui/LoadingSpinner';

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
const QuestScreen = lazyRetry(() => import('./screens/QuestScreen').then((m) => ({ default: m.QuestScreen })));
const GuildScreen = lazyRetry(() => import('./screens/GuildScreen').then((m) => ({ default: m.GuildScreen })));
const NodeTreeScreen = lazyRetry(() => import('./screens/NodeTreeScreen').then((m) => ({ default: m.NodeTreeScreen })));
const MarketplaceScreen = lazyRetry(() => import('./screens/MarketplaceScreen').then((m) => ({ default: m.MarketplaceScreen })));
const PvPScreen = lazyRetry(() => import('./screens/PvPScreen').then((m) => ({ default: m.PvPScreen })));
const PremiumShopScreen = lazyRetry(() => import('./screens/PremiumShopScreen').then((m) => ({ default: m.PremiumShopScreen })));
const AnnouncementScreen = lazyRetry(() => import('./screens/AnnouncementScreen').then((m) => ({ default: m.AnnouncementScreen })));
const FeedbackScreen = lazyRetry(() => import('./screens/FeedbackScreen').then((m) => ({ default: m.FeedbackScreen })));
const AdminScreen = lazyRetry(() => import('./screens/AdminScreen').then((m) => ({ default: m.AdminScreen })));
const StatusScreen = lazyRetry(() => import('./screens/StatusScreen').then((m) => ({ default: m.StatusScreen })));
const EnhanceScreen = lazyRetry(() => import('./screens/EnhanceScreen').then((m) => ({ default: m.EnhanceScreen })));
const CraftScreen = lazyRetry(() => import('./screens/CraftScreen').then((m) => ({ default: m.CraftScreen })));
const WorldEventScreen = lazyRetry(() => import('./screens/WorldEventScreen').then((m) => ({ default: m.WorldEventScreen })));

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

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner message="불러오는 중..." />}>
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
                      <Route path="/quests" element={<QuestScreen />} />
                      <Route path="/guild" element={<GuildScreen />} />
                      <Route path="/nodes" element={<NodeTreeScreen />} />
                      <Route path="/marketplace" element={<MarketplaceScreen />} />
                      <Route path="/pvp" element={<PvPScreen />} />
                      <Route path="/premium" element={<PremiumShopScreen />} />
                      <Route path="/announcements" element={<AnnouncementScreen />} />
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
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
