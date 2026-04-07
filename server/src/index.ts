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
      // 이미 적용됐는지 체크 (migration_applied 플래그)
      await query(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`);
      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'node_merge_v2'`);
      if (applied.rowCount && applied.rowCount > 0) return;

      console.log('[migration] node_merge_v2: 노드 존 통합 + 선행조건 재설정...');

      // 1) 모든 존을 core로, 선행조건 초기화
      await query(`UPDATE node_definitions SET zone = 'core', prerequisites = '{}'`);

      // 2) 전체 노드를 ID순으로 가져오기
      const allNodes = await query<{ id: number; tier: string; name: string }>(
        `SELECT id, tier, name FROM node_definitions ORDER BY id`
      );
      const nodes = allNodes.rows;
      const smalls = nodes.filter(n => n.tier === 'small');
      const mediums = nodes.filter(n => n.tier === 'medium');
      const larges = nodes.filter(n => n.tier === 'large');

      // 3) 진입점: 소형 노드 중 첫 6개 = 중앙 허브 (선행 없음, cost=1)
      const HUB_COUNT = 6;
      const hubs = smalls.slice(0, HUB_COUNT);

      // 4) 나머지 소형 노드: 3개씩 브랜치로, 각 브랜치는 허브 하나에서 뻗어나감 (cost=1)
      const branchSmalls = smalls.slice(HUB_COUNT);
      const BRANCH_SIZE = 3;
      for (let i = 0; i < branchSmalls.length; i++) {
        const branchIdx = Math.floor(i / BRANCH_SIZE);
        const posInBranch = i % BRANCH_SIZE;
        if (posInBranch === 0) {
          // 브랜치 첫 노드 → 허브 노드 선행
          const hubIdx = branchIdx % HUB_COUNT;
          await query('UPDATE node_definitions SET prerequisites = $1, cost = 1 WHERE id = $2',
            [[hubs[hubIdx].id], branchSmalls[i].id]);
        } else {
          // 브랜치 내 체인
          await query('UPDATE node_definitions SET prerequisites = $1, cost = 1 WHERE id = $2',
            [[branchSmalls[i - 1].id], branchSmalls[i].id]);
        }
      }

      // 허브 노드 cost=1
      for (const h of hubs) {
        await query('UPDATE node_definitions SET cost = 1 WHERE id = $1', [h.id]);
      }

      // 5) 중형 노드: 소형 브랜치 끝에서 연결 (cost=2)
      for (let i = 0; i < mediums.length; i++) {
        // 각 중형은 소형 브랜치의 마지막 노드를 선행으로
        const branchEnd = Math.min((i + 1) * BRANCH_SIZE - 1, branchSmalls.length - 1);
        if (branchEnd >= 0 && branchEnd < branchSmalls.length) {
          await query('UPDATE node_definitions SET prerequisites = $1, cost = 2 WHERE id = $2',
            [[branchSmalls[branchEnd].id], mediums[i].id]);
        } else if (i > 0) {
          // 소형 브랜치 부족하면 이전 중형 선행
          await query('UPDATE node_definitions SET prerequisites = $1, cost = 2 WHERE id = $2',
            [[mediums[i - 1].id], mediums[i].id]);
        } else {
          // 최소한 허브 하나 선행
          await query('UPDATE node_definitions SET prerequisites = $1, cost = 2 WHERE id = $2',
            [[hubs[0].id], mediums[i].id]);
        }
      }

      // 6) 대형(키스톤) 노드: 중형 2개 선행 (cost=4)
      for (let i = 0; i < larges.length; i++) {
        const m1 = mediums[Math.min(i * 2, mediums.length - 1)];
        const m2 = mediums[Math.min(i * 2 + 1, mediums.length - 1)];
        const prereqs = m1.id === m2.id ? [m1.id] : [m1.id, m2.id];
        await query('UPDATE node_definitions SET prerequisites = $1, cost = 4 WHERE id = $2',
          [prereqs, larges[i].id]);
      }

      await query(`INSERT INTO _migrations (name) VALUES ('node_merge_v2')`);
      console.log(`[migration] node_merge_v2: 완료 (${smalls.length} small, ${mediums.length} medium, ${larges.length} large)`);
    } catch (e) {
      console.error('[migration] node_merge_v2 error:', e);
    }
  })();
  // 접두사 수치 상향 마이그레이션
  (async () => {
    try {
      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'prefix_buff_v1'`);
      if (applied.rowCount && applied.rowCount > 0) return;
      console.log('[migration] prefix_buff_v1: 접두사 수치 상향...');
      // STR/DEX/INT/VIT: 대폭 상향
      await query(`UPDATE item_prefixes SET min_val=5,  max_val=10 WHERE tier=1 AND stat_key IN ('str','dex','int','vit')`);
      await query(`UPDATE item_prefixes SET min_val=12, max_val=20 WHERE tier=2 AND stat_key IN ('str','dex','int','vit')`);
      await query(`UPDATE item_prefixes SET min_val=22, max_val=35 WHERE tier=3 AND stat_key IN ('str','dex','int','vit')`);
      await query(`UPDATE item_prefixes SET min_val=38, max_val=55 WHERE tier=4 AND stat_key IN ('str','dex','int','vit')`);
      // SPD: 상향
      await query(`UPDATE item_prefixes SET min_val=8,  max_val=15 WHERE tier=1 AND stat_key='spd'`);
      await query(`UPDATE item_prefixes SET min_val=18, max_val=30 WHERE tier=2 AND stat_key='spd'`);
      await query(`UPDATE item_prefixes SET min_val=35, max_val=55 WHERE tier=3 AND stat_key='spd'`);
      await query(`UPDATE item_prefixes SET min_val=60, max_val=90 WHERE tier=4 AND stat_key='spd'`);
      // CRI: 상향
      await query(`UPDATE item_prefixes SET min_val=2,  max_val=4  WHERE tier=1 AND stat_key='cri'`);
      await query(`UPDATE item_prefixes SET min_val=5,  max_val=9  WHERE tier=2 AND stat_key='cri'`);
      await query(`UPDATE item_prefixes SET min_val=10, max_val=16 WHERE tier=3 AND stat_key='cri'`);
      await query(`UPDATE item_prefixes SET min_val=18, max_val=28 WHERE tier=4 AND stat_key='cri'`);
      // ACC: 상향
      await query(`UPDATE item_prefixes SET min_val=3,  max_val=6  WHERE tier=1 AND stat_key='accuracy'`);
      await query(`UPDATE item_prefixes SET min_val=8,  max_val=14 WHERE tier=2 AND stat_key='accuracy'`);
      await query(`UPDATE item_prefixes SET min_val=16, max_val=25 WHERE tier=3 AND stat_key='accuracy'`);
      await query(`UPDATE item_prefixes SET min_val=28, max_val=40 WHERE tier=4 AND stat_key='accuracy'`);
      // DODGE: 상향
      await query(`UPDATE item_prefixes SET min_val=2,  max_val=5  WHERE tier=1 AND stat_key='dodge'`);
      await query(`UPDATE item_prefixes SET min_val=6,  max_val=12 WHERE tier=2 AND stat_key='dodge'`);
      await query(`UPDATE item_prefixes SET min_val=14, max_val=22 WHERE tier=3 AND stat_key='dodge'`);
      await query(`UPDATE item_prefixes SET min_val=24, max_val=35 WHERE tier=4 AND stat_key='dodge'`);
      await query(`INSERT INTO _migrations (name) VALUES ('prefix_buff_v1')`);
      console.log('[migration] prefix_buff_v1: 완료');
    } catch (e) {
      console.error('[migration] prefix_buff_v1 error:', e);
    }
  })();
  // 기존 캐릭터 레벨업 스탯 소급 적용
  (async () => {
    try {
      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'retroactive_stat_growth'`);
      if (applied.rowCount && applied.rowCount > 0) return;
      console.log('[migration] retroactive_stat_growth: 기존 캐릭터 스탯 보정...');

      const CLASS_START: Record<string, { str: number; dex: number; int: number; vit: number; spd: number; cri: number }> = {
        warrior: { str: 15, dex: 8,  int: 4,  vit: 14, spd: 300, cri: 5  },
        mage:    { str: 4,  dex: 7,  int: 16, vit: 8,  spd: 250, cri: 6  },
        cleric:  { str: 8,  dex: 6,  int: 14, vit: 12, spd: 200, cri: 4  },
        rogue:   { str: 10, dex: 14, int: 5,  vit: 8,  spd: 400, cri: 12 },
      };
      const CLASS_GROWTH: Record<string, { str: number; dex: number; int: number; vit: number; spd: number; cri: number }> = {
        warrior: { str: 3, dex: 1, int: 0, vit: 2, spd: 5, cri: 1 },
        mage:    { str: 0, dex: 1, int: 3, vit: 1, spd: 4, cri: 1 },
        cleric:  { str: 1, dex: 1, int: 2, vit: 2, spd: 3, cri: 1 },
        rogue:   { str: 2, dex: 3, int: 0, vit: 1, spd: 6, cri: 2 },
      };

      const chars = await query<{ id: number; level: number; class_name: string; max_hp: number }>(
        'SELECT id, level, class_name, max_hp FROM characters WHERE level > 1'
      );

      for (const c of chars.rows) {
        const start = CLASS_START[c.class_name] || CLASS_START.warrior;
        const growth = CLASS_GROWTH[c.class_name] || CLASS_GROWTH.warrior;
        const levelsGained = c.level - 1;

        const newStats = {
          str: start.str + growth.str * levelsGained,
          dex: start.dex + growth.dex * levelsGained,
          int: start.int + growth.int * levelsGained,
          vit: start.vit + growth.vit * levelsGained,
          spd: start.spd + growth.spd * levelsGained,
          cri: start.cri + growth.cri * levelsGained,
        };

        // max_hp 보정: 기존 +5/lv → +8/lv, 차이분 추가
        const oldHpGrowth = levelsGained * 5;
        const newHpGrowth = levelsGained * 8;
        const baseMaxHp = CLASS_START[c.class_name]?.str ? // just check class exists
          (c.class_name === 'warrior' ? 200 : c.class_name === 'cleric' ? 160 : c.class_name === 'rogue' ? 130 : 120) : 200;
        const correctMaxHp = baseMaxHp + newHpGrowth;

        await query(
          `UPDATE characters SET stats = $1, max_hp = $2, hp = LEAST(hp, $2) WHERE id = $3`,
          [JSON.stringify(newStats), correctMaxHp, c.id]
        );
        console.log(`  [${c.id}] ${c.class_name} Lv.${c.level}: stats 보정 완료`);
      }

      await query(`INSERT INTO _migrations (name) VALUES ('retroactive_stat_growth')`);
      console.log(`[migration] retroactive_stat_growth: ${chars.rowCount}캐릭터 보정 완료`);
    } catch (e) {
      console.error('[migration] retroactive_stat_growth error:', e);
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
