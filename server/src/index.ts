import dotenv from 'dotenv';
dotenv.config({ override: false }); // 기존 환경변수를 덮어쓰지 않음
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
// party removed in v0.9
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
import prefixRoutes from './routes/prefixes.js';
import dropLogRoutes from './routes/dropLog.js';
import { initWebSocket } from './ws/index.js';
import { setIo } from './ws/io.js';
import { checkAndSpawnWorldEvent, checkExpiredWorldEvents } from './game/worldEvent.js';
import nodeRoutes from './routes/nodes.js';
import { restoreCombatSessions } from './combat/engine.js';
import { query } from './db/pool.js';

console.log('[env] DATABASE_URL =', process.env.DATABASE_URL ? '***set***' : '!!!MISSING!!!');
console.log('[env] PORT =', process.env.PORT);

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
// party removed in v0.9
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
app.use('/api/prefixes', prefixRoutes);
app.use('/api/drop-log', dropLogRoutes);
app.use('/api/characters', nodeRoutes);

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
setIo(io);

httpServer.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
  // 노드트리 존 통합 마이그레이션 (017)
  (async () => {
    try {
      const check = await query<{ zone: string }>('SELECT DISTINCT zone FROM node_definitions LIMIT 10');
      const zones = check.rows.map(r => r.zone);
      if (zones.length > 1 || (zones.length === 1 && zones[0] !== 'core')) {
        console.log('[migration] 017: 노드 존 통합 실행...');
        await query('UPDATE node_definitions SET zone = $1', ['core']);
        // 선행조건 재설정
        await query('UPDATE node_definitions SET prerequisites = $1', ['{}']);
        // 중앙 소형 노드 (기본 * 이름)
        const centerSmalls = await query<{ id: number }>(`SELECT id FROM node_definitions WHERE tier = 'small' AND name LIKE '기본 %' ORDER BY id`);
        const cs = centerSmalls.rows.map(r => r.id);
        // 중앙 소형 2개씩 체인
        for (let i = 1; i < cs.length; i += 2) {
          await query('UPDATE node_definitions SET prerequisites = $1 WHERE id = $2', [[cs[i-1]], cs[i]]);
        }
        // 중앙 중형 (만능 * 이름)
        const centerMediums = await query<{ id: number }>(`SELECT id FROM node_definitions WHERE tier = 'medium' AND name LIKE '만능 %' ORDER BY id`);
        const cm = centerMediums.rows.map(r => r.id);
        for (let i = 0; i < cm.length && i * 2 + 1 < cs.length; i++) {
          await query('UPDATE node_definitions SET prerequisites = $1 WHERE id = $2', [[cs[i*2], cs[i*2+1]], cm[i]]);
        }
        // 중앙 대형 (특수 이름)
        const centerLarges = await query<{ id: number }>(`SELECT id FROM node_definitions WHERE tier = 'large' AND (name LIKE '광전사%' OR name LIKE '철의%' OR name LIKE '마력%' OR name LIKE '극한 집중%') ORDER BY id`);
        const cl = centerLarges.rows.map(r => r.id);
        for (let i = 0; i < cl.length && i * 2 + 1 < cm.length; i++) {
          await query('UPDATE node_definitions SET prerequisites = $1 WHERE id = $2', [[cm[i*2], cm[i*2+1]], cl[i]]);
        }
        // 비중앙 소형 → 중앙 소형 연결 (6개 그룹)
        const otherSmalls = await query<{ id: number }>(`SELECT id FROM node_definitions WHERE tier = 'small' AND name NOT LIKE '기본 %' ORDER BY id`);
        const os = otherSmalls.rows.map(r => r.id);
        for (let i = 0; i < os.length; i++) {
          if (i % 6 === 0) {
            const parentIdx = Math.floor(i / 6) % cs.length;
            await query('UPDATE node_definitions SET prerequisites = $1 WHERE id = $2', [[cs[parentIdx]], os[i]]);
          } else {
            await query('UPDATE node_definitions SET prerequisites = $1 WHERE id = $2', [[os[i-1]], os[i]]);
          }
        }
        // 비중앙 중형 → 소형 6개 그룹 마지막 선행
        const otherMediums = await query<{ id: number }>(`SELECT id FROM node_definitions WHERE tier = 'medium' AND name NOT LIKE '만능 %' ORDER BY id`);
        const om = otherMediums.rows.map(r => r.id);
        for (let i = 0; i < om.length; i++) {
          const lastSmallIdx = (i + 1) * 6 - 1;
          if (lastSmallIdx < os.length) {
            await query('UPDATE node_definitions SET prerequisites = $1 WHERE id = $2', [[os[lastSmallIdx]], om[i]]);
          } else if (i > 0) {
            await query('UPDATE node_definitions SET prerequisites = $1 WHERE id = $2', [[om[i-1]], om[i]]);
          }
        }
        // 비중앙 대형 → 중형 2개 선행
        const otherLarges = await query<{ id: number }>(`SELECT id FROM node_definitions WHERE tier = 'large' AND NOT (name LIKE '광전사%' OR name LIKE '철의%' OR name LIKE '마력%' OR name LIKE '극한 집중%') ORDER BY id`);
        const ol = otherLarges.rows.map(r => r.id);
        for (let i = 0; i < ol.length; i++) {
          const m1 = om[Math.min(i*2, om.length-1)];
          const m2 = om[Math.min(i*2+1, om.length-1)];
          await query('UPDATE node_definitions SET prerequisites = $1 WHERE id = $2', [[m1, m2], ol[i]]);
        }
        console.log('[migration] 017: 완료');
      }
    } catch (e) {
      console.error('[migration] 017 error:', e);
    }
  })();
  // 기존 전투 세션 복구
  restoreCombatSessions().catch(e => console.error('[combat] restore error', e));
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
