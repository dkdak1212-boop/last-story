import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { useAuthStore } from './stores/authStore';
import { AppShell } from './components/layout/AppShell';
import { LoadingSpinner } from './components/ui/LoadingSpinner';

const LoginScreen = lazy(() => import('./screens/LoginScreen').then((m) => ({ default: m.LoginScreen })));
const CharacterSelectScreen = lazy(() => import('./screens/CharacterSelectScreen').then((m) => ({ default: m.CharacterSelectScreen })));
const VillageScreen = lazy(() => import('./screens/VillageScreen').then((m) => ({ default: m.VillageScreen })));
const MapScreen = lazy(() => import('./screens/MapScreen').then((m) => ({ default: m.MapScreen })));
const CombatScreen = lazy(() => import('./screens/CombatScreen').then((m) => ({ default: m.CombatScreen })));
const InventoryScreen = lazy(() => import('./screens/InventoryScreen').then((m) => ({ default: m.InventoryScreen })));
const SkillsScreen = lazy(() => import('./screens/SkillsScreen').then((m) => ({ default: m.SkillsScreen })));
const ShopScreen = lazy(() => import('./screens/ShopScreen').then((m) => ({ default: m.ShopScreen })));
const MailboxScreen = lazy(() => import('./screens/MailboxScreen').then((m) => ({ default: m.MailboxScreen })));
const RankingScreen = lazy(() => import('./screens/RankingScreen').then((m) => ({ default: m.RankingScreen })));
const QuestScreen = lazy(() => import('./screens/QuestScreen').then((m) => ({ default: m.QuestScreen })));
const GuildScreen = lazy(() => import('./screens/GuildScreen').then((m) => ({ default: m.GuildScreen })));
const PartyScreen = lazy(() => import('./screens/PartyScreen').then((m) => ({ default: m.PartyScreen })));
const MarketplaceScreen = lazy(() => import('./screens/MarketplaceScreen').then((m) => ({ default: m.MarketplaceScreen })));
const PvPScreen = lazy(() => import('./screens/PvPScreen').then((m) => ({ default: m.PvPScreen })));
const PremiumShopScreen = lazy(() => import('./screens/PremiumShopScreen').then((m) => ({ default: m.PremiumShopScreen })));
const AnnouncementScreen = lazy(() => import('./screens/AnnouncementScreen').then((m) => ({ default: m.AnnouncementScreen })));
const FeedbackScreen = lazy(() => import('./screens/FeedbackScreen').then((m) => ({ default: m.FeedbackScreen })));
const AdminScreen = lazy(() => import('./screens/AdminScreen').then((m) => ({ default: m.AdminScreen })));
const StatusScreen = lazy(() => import('./screens/StatusScreen').then((m) => ({ default: m.StatusScreen })));
const EnhanceScreen = lazy(() => import('./screens/EnhanceScreen').then((m) => ({ default: m.EnhanceScreen })));
const WorldEventScreen = lazy(() => import('./screens/WorldEventScreen').then((m) => ({ default: m.WorldEventScreen })));

function Protected({ children }: { children: React.ReactNode }) {
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  if (!isAuth) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
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
                    <Route path="/party" element={<PartyScreen />} />
                    <Route path="/marketplace" element={<MarketplaceScreen />} />
                    <Route path="/pvp" element={<PvPScreen />} />
                    <Route path="/premium" element={<PremiumShopScreen />} />
                    <Route path="/announcements" element={<AnnouncementScreen />} />
                    <Route path="/feedback" element={<FeedbackScreen />} />
                    <Route path="/admin" element={<AdminScreen />} />
                    <Route path="/status" element={<StatusScreen />} />
                    <Route path="/enhance" element={<EnhanceScreen />} />
                    <Route path="/world-event" element={<WorldEventScreen />} />
                  </Routes>
                </AppShell>
              </Protected>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
