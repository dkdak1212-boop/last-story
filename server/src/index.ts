import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import characterRoutes from './routes/characters.js';
import fieldRoutes from './routes/fields.js';
import shopRoutes from './routes/shop.js';
import shopBuyRoutes from './routes/shop-buy.js';
import combatRoutes from './routes/combat.js';
import inventoryRoutes from './routes/inventory.js';
import skillRoutes from './routes/skills.js';
import offlineRoutes from './routes/offline.js';
import mailboxRoutes from './routes/mailbox.js';
import questsRoutes from './routes/quests.js';
import rankingRoutes from './routes/ranking.js';
import chatRoutes from './routes/chat.js';
import settingsRoutes from './routes/settings.js';
import guildsRoutes from './routes/guilds.js';
import partyRoutes from './routes/party.js';
import marketplaceRoutes, { settleExpiredAuctions } from './routes/marketplace.js';
import pvpRoutes from './routes/pvp.js';
import premiumRoutes from './routes/premium.js';
import announcementsRoutes from './routes/announcements.js';
import feedbackRoutes from './routes/feedback.js';
import adminRoutes from './routes/admin.js';
import meRoutes from './routes/me.js';
import statusRoutes from './routes/status.js';
import enhanceRoutes from './routes/enhance.js';
import dailyRoutes from './routes/daily.js';
import worldEventRoutes from './routes/worldEvent.js';
import { initWebSocket } from './ws/index.js';
import { checkAndSpawnWorldEvent, checkExpiredWorldEvents } from './game/worldEvent.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/characters', combatRoutes);
app.use('/api/characters', inventoryRoutes);
app.use('/api/characters', skillRoutes);
app.use('/api/characters', shopBuyRoutes);
app.use('/api/characters', offlineRoutes);
app.use('/api/characters', mailboxRoutes);
app.use('/api/characters', questsRoutes);
app.use('/api/characters', settingsRoutes);
app.use('/api/guilds', guildsRoutes);
app.use('/api/party', partyRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/pvp', pvpRoutes);
app.use('/api/premium', premiumRoutes);
app.use('/api/me', meRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/characters', statusRoutes);
app.use('/api/enhance', enhanceRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api/fields', fieldRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/world-event', worldEventRoutes);

// 프로덕션: 빌드된 클라이언트 정적 파일 서빙
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res, next) => {
  if (_req.path.startsWith('/api') || _req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'internal error' });
});

const httpServer = createServer(app);
const io = initWebSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});

// 경매 만료 정산 (1분마다)
setInterval(() => {
  settleExpiredAuctions().catch((e) => console.error('[auction] settle error', e));
}, 60_000);

// 월드 이벤트 스폰/만료 체크 (1분마다)
setInterval(() => {
  checkAndSpawnWorldEvent(io).catch((e) => console.error('[world-event] spawn error', e));
  checkExpiredWorldEvents(io).catch((e) => console.error('[world-event] expire error', e));
}, 60_000);
