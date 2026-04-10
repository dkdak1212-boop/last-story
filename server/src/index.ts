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
import enhanceLogRoutes from './routes/enhanceLog.js';
import guestbookRoutes from './routes/guestbook.js';
import craftRoutes from './routes/craft.js';
import { initWebSocket } from './ws/index.js';
import { setIo } from './ws/io.js';
import { checkAndSpawnWorldEvent, checkExpiredWorldEvents } from './game/worldEvent.js';
import nodeRoutes from './routes/nodes.js';
import dailyQuestRoutes from './routes/dailyQuests.js';
import achievementRoutes from './routes/achievements.js';
import { restoreCombatSessions } from './combat/engine.js';
import migrateForceRoutes from './routes/migrate-force.js';
import { query } from './db/pool.js';

console.log('[env] DATABASE_URL =', process.env.DATABASE_URL ? '***set***' : '!!!MISSING!!!');
console.log('[env] PORT =', process.env.PORT);

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.use('/api/migrate-force', migrateForceRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 디버그: 마이그레이션 상태 + 아이템 수 확인
app.get('/api/debug/status', async (_req, res) => {
  try {
    const migrations = await query('SELECT name, applied_at FROM _migrations ORDER BY applied_at DESC');
    const itemCount = await query('SELECT COUNT(*)::int AS cnt FROM items WHERE slot IS NOT NULL');
    const itemSample = await query('SELECT id, name, slot, grade FROM items WHERE slot IS NOT NULL ORDER BY id LIMIT 10');
    const itemMax = await query('SELECT MAX(id)::int AS max_id FROM items');
    const potionCount = await query('SELECT COUNT(*)::int AS cnt FROM items WHERE type = \'consumable\'');
    res.json({
      migrations: migrations.rows,
      equipItemCount: itemCount.rows[0]?.cnt,
      potionCount: potionCount.rows[0]?.cnt,
      maxItemId: itemMax.rows[0]?.max_id,
      sampleItems: itemSample.rows,
    });
  } catch (e: any) {
    res.json({ error: e.message });
  }
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
app.use('/api/enhance-log', enhanceLogRoutes);
app.use('/api/guestbook', guestbookRoutes);
app.use('/api/craft', craftRoutes);
app.use('/api/characters', nodeRoutes);
app.use('/api/characters', dailyQuestRoutes);
app.use('/api/characters', achievementRoutes);

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
  // 기존 마이그레이션 + 장비 개편을 순차 실행
  (async () => {
    try {
      await runMigrations();
      console.log('[migrations] 기존 마이그레이션 완료');
    } catch (e) {
      console.error('[migrations] runMigrations error (계속 진행):', e);
    }
    // 장비 개편은 항상 독립 실행 (이전 에러와 무관)
    try {
      await runEquipOverhaul();
      console.log('[migrations] 장비 개편 완료');
    } catch (e) {
      console.error('[migrations] equip overhaul error:', e);
    }
    restoreCombatSessions().catch(e => console.error('[combat] restore error', e));
  })();
});

async function runMigrations() {
  // 노드트리 존 통합 마이그레이션 (017)
  {
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
  }
  // 접두사 수치 상향 마이그레이션
  {
    try {
      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'prefix_buff_v2'`);
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
      // CRI: 4/1 너프
      await query(`UPDATE item_prefixes SET min_val=1,  max_val=1  WHERE tier=1 AND stat_key='cri'`);
      await query(`UPDATE item_prefixes SET min_val=1,  max_val=2  WHERE tier=2 AND stat_key='cri'`);
      await query(`UPDATE item_prefixes SET min_val=2,  max_val=4  WHERE tier=3 AND stat_key='cri'`);
      await query(`UPDATE item_prefixes SET min_val=4,  max_val=7  WHERE tier=4 AND stat_key='cri'`);
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
      await query(`INSERT INTO _migrations (name) VALUES ('prefix_buff_v2')`);
      console.log('[migration] prefix_buff_v1: 완료');
    } catch (e) {
      console.error('[migration] prefix_buff_v1 error:', e);
    }
  }
  // 기존 캐릭터 레벨업 스탯 소급 적용 (밸런스 v2)
  {
    try {
      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'stat_rebalance_v2'`);
      if (applied.rowCount && applied.rowCount > 0) return;
      console.log('[migration] stat_rebalance_v2: 전체 캐릭터 스탯 밸런스 재조정...');

      const CLASS_START: Record<string, { str: number; dex: number; int: number; vit: number; spd: number; cri: number; maxHp: number }> = {
        warrior: { str: 15, dex: 8,  int: 4,  vit: 14, spd: 300, cri: 5, maxHp: 200  },
        mage:    { str: 4,  dex: 7,  int: 16, vit: 8,  spd: 250, cri: 6, maxHp: 120  },
        cleric:  { str: 8,  dex: 6,  int: 14, vit: 12, spd: 200, cri: 4, maxHp: 160  },
        rogue:   { str: 10, dex: 14, int: 5,  vit: 8,  spd: 400, cri: 12, maxHp: 130 },
      };
      // 밸런스 v2 성장치 (하향)
      const CLASS_GROWTH: Record<string, { str: number; dex: number; int: number; vit: number; spd: number; cri: number }> = {
        warrior: { str: 2, dex: 0.5, int: 0, vit: 1.5, spd: 2, cri: 0.3 },
        mage:    { str: 0, dex: 0.5, int: 2, vit: 0.5, spd: 1.5, cri: 0.3 },
        cleric:  { str: 0.5, dex: 0.5, int: 1.5, vit: 1, spd: 1, cri: 0.2 },
        rogue:   { str: 1, dex: 1.5, int: 0, vit: 0.5, spd: 3, cri: 0.5 },
      };

      const chars = await query<{ id: number; level: number; class_name: string }>(
        'SELECT id, level, class_name FROM characters'
      );

      for (const c of chars.rows) {
        const start = CLASS_START[c.class_name] || CLASS_START.warrior;
        const growth = CLASS_GROWTH[c.class_name] || CLASS_GROWTH.warrior;
        const lv = c.level - 1;

        const newStats = {
          str: Math.floor(start.str + growth.str * lv),
          dex: Math.floor(start.dex + growth.dex * lv),
          int: Math.floor(start.int + growth.int * lv),
          vit: Math.floor(start.vit + growth.vit * lv),
          spd: Math.floor(start.spd + growth.spd * lv),
          cri: Math.floor(start.cri + growth.cri * lv),
        };
        const correctMaxHp = start.maxHp + lv * 8;

        await query(
          `UPDATE characters SET stats = $1, max_hp = $2, hp = LEAST(hp, $2) WHERE id = $3`,
          [JSON.stringify(newStats), correctMaxHp, c.id]
        );
      }

      await query(`DELETE FROM _migrations WHERE name = 'retroactive_stat_growth'`);
      await query(`INSERT INTO _migrations (name) VALUES ('stat_rebalance_v2') ON CONFLICT DO NOTHING`);
      console.log(`[migration] stat_rebalance_v2: ${chars.rowCount}캐릭터 보정 완료`);
    } catch (e) {
      console.error('[migration] stat_rebalance_v2 error:', e);
    }
  }
  // 성직자 Lv.1 공격스킬 추가 마이그레이션
  {
    try {
      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'cleric_lv1_attack'`);
      if (applied.rowCount && applied.rowCount > 0) return;
      console.log('[migration] cleric_lv1_attack: 성직자 스킬 재배치...');

      // 기존 성직자 스킬 레벨 밀기: 30→35, 25→30, 20→25, 15→20, 10→15, 5→10, 1→5
      // 역순으로 업데이트해야 충돌 방지
      await query(`UPDATE skills SET required_level = 35 WHERE class_name = 'cleric' AND required_level = 30`);
      await query(`UPDATE skills SET required_level = 30 WHERE class_name = 'cleric' AND required_level = 25`);
      await query(`UPDATE skills SET required_level = 25 WHERE class_name = 'cleric' AND required_level = 20`);
      await query(`UPDATE skills SET required_level = 20 WHERE class_name = 'cleric' AND required_level = 15`);
      await query(`UPDATE skills SET required_level = 15 WHERE class_name = 'cleric' AND required_level = 10`);
      await query(`UPDATE skills SET required_level = 10 WHERE class_name = 'cleric' AND required_level = 5`);
      await query(`UPDATE skills SET required_level = 5  WHERE class_name = 'cleric' AND required_level = 1`);

      // Lv.1 공격스킬 추가: 신성 타격 (기본기, 쿨다운 0)
      await query(`INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration)
        VALUES ('cleric', '신성 타격', 'ATK x140%, 신성한 빛으로 타격', 1, 1.40, 'damage', 0, 0, 'damage', 0, 0)`);

      await query(`INSERT INTO _migrations (name) VALUES ('cleric_lv1_attack')`);
      console.log('[migration] cleric_lv1_attack: 완료');
    } catch (e) {
      console.error('[migration] cleric_lv1_attack error:', e);
    }
  }
  // 직업별 스킬 4개씩 추가 마이그레이션
  {
    try {
      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'add_skills_v2'`);
      if (applied.rowCount && applied.rowCount > 0) return;
      console.log('[migration] add_skills_v2: 직업별 스킬 4개씩 추가...');

      // 전사 추가 스킬 (Lv.35, 40, 45, 50)
      await query(`INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration) VALUES
        ('warrior', '대지 분쇄',     'ATK x250%, 적 스피드 30% 감소 2행동',        35, 2.50, 'damage', 5, 0,  'speed_mod', -30, 2),
        ('warrior', '전쟁의 함성',   '3행동간 ATK 40% 증가 (자기 버프)',           40, 0.00, 'buff',   7, 0,  'damage_reduce', 0, 3),
        ('warrior', '참수',          'ATK x320% + 적 현재 HP 8% 고정 데미지',      45, 3.20, 'damage', 6, 0,  'hp_pct_damage', 8, 0),
        ('warrior', '최후의 일격',   'ATK x400%, 자신 HP 10% 소모, 흡혈 50%',      50, 4.00, 'damage', 8, 0,  'lifesteal', 50, 0)
      `);

      // 마법사 추가 스킬 (Lv.35, 40, 45, 50)
      await query(`INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration) VALUES
        ('mage', '연쇄 번개',       'ATK x200% x2회 연속, 각 타격 스턴 확률',      35, 2.00, 'damage', 5, 0,  'multi_hit', 2, 0),
        ('mage', '절대 영도',       '적 게이지 동결 3행동 + ATK x180%',            40, 1.80, 'damage', 7, 0,  'gauge_freeze', 0, 3),
        ('mage', '운석 폭격',       'ATK x350% + 100, 화상 도트 4행동',            45, 3.50, 'damage', 7, 100,'dot', 0, 4),
        ('mage', '차원 붕괴',       'ATK x450%, 자신 스피드 40% 감소 2행동',       50, 4.50, 'damage', 9, 0,  'self_speed_mod', -40, 2)
      `);

      // 성직자 추가 스킬 (Lv.40, 45, 50, 55)
      await query(`INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration) VALUES
        ('cleric', '정화의 빛',     '최대 HP 35% 회복 + 디버프 해제',              40, 0.00, 'heal',   5, 0,  'heal_pct', 35, 0),
        ('cleric', '신성 폭발',     'ATK x280% + 60, 신성 도트 4행동',             45, 2.80, 'damage', 5, 60, 'dot', 0, 4),
        ('cleric', '천상의 방벽',   '최대 HP 40% 실드 + 데미지 20% 감소 3행동',    50, 0.00, 'buff',   8, 0,  'shield', 40, 3),
        ('cleric', '심판의 날',     'ATK x380%, 적 실드 파괴, 스턴 1행동',         55, 3.80, 'damage', 9, 0,  'shield_break', 0, 1)
      `);

      // 도적 추가 스킬 (Lv.35, 40, 45, 50)
      await query(`INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration) VALUES
        ('rogue', '암살',           'ATK x300%, 치명타 확률 +30%',                 35, 3.00, 'damage', 5, 0,  'crit_bonus', 30, 0),
        ('rogue', '독안개',         '적 명중률 40% 감소 3행동, 독 도트',            40, 0.00, 'debuff', 6, 0,  'accuracy_debuff', 40, 3),
        ('rogue', '그림자 폭풍',    'ATK x150% x5회, 각 타격마다 독 중첩',         45, 1.50, 'damage', 7, 0,  'multi_hit_poison', 5, 0),
        ('rogue', '사신의 포옹',    'ATK x380% + 적 현재 HP 12% 고정 데미지',      50, 3.80, 'damage', 8, 0,  'hp_pct_damage', 12, 0)
      `);

      await query(`INSERT INTO _migrations (name) VALUES ('add_skills_v2')`);
      console.log('[migration] add_skills_v2: 16개 스킬 추가 완료');
    } catch (e) {
      console.error('[migration] add_skills_v2 error:', e);
    }
  }
  // MP 물약 제거 마이그레이션
  {
    try {
      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'remove_mp_potions'`);
      if (applied.rowCount && applied.rowCount > 0) return;
      console.log('[migration] remove_mp_potions: MP 물약 삭제...');
      // 상점에서 제거
      await query(`DELETE FROM shop_entries WHERE item_id IN (101, 103, 105, 107)`);
      // 인벤토리에서 제거
      await query(`DELETE FROM character_inventory WHERE item_id IN (101, 103, 105, 107)`);
      // 아이템 정의 삭제
      await query(`DELETE FROM items WHERE id IN (101, 103, 105, 107)`);
      await query(`INSERT INTO _migrations (name) VALUES ('remove_mp_potions')`);
      console.log('[migration] remove_mp_potions: 완료');
    } catch (e) {
      console.error('[migration] remove_mp_potions error:', e);
    }
  }
  // 방어구 통일화 마이그레이션
  {
    try {
      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'armor_unify_v1'`);
      if (applied.rowCount && applied.rowCount > 0) return;
      console.log('[migration] armor_unify_v1: 방어구 통일화...');

      // 기존 방어구 ID 수집 (helm, chest, boots, legs)
      const oldArmor = await query<{ id: number }>(`SELECT id FROM items WHERE slot IN ('helm','chest','boots','legs')`);
      const oldIds = oldArmor.rows.map(r => r.id);

      if (oldIds.length > 0) {
        // 인벤토리/장착에서 기존 방어구 제거
        await query(`DELETE FROM character_inventory WHERE item_id = ANY($1::int[])`, [oldIds]);
        await query(`DELETE FROM character_equipped WHERE item_id = ANY($1::int[])`, [oldIds]);
        // 기존 방어구 아이템 삭제
        await query(`DELETE FROM items WHERE id = ANY($1::int[])`, [oldIds]);
      }

      // legs 슬롯 없앰 (투구/갑옷/신발만)
      // 새 방어구 추가: 4단계 x 3부위 = 12개
      // ID 400번대 사용

      // ── Lv.1~20 초급 방어구 (common) ──
      await query(`INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
        (400, '초급 가죽 투구',   'armor','common','helm',  '{"vit":5,"dex":2}',           'Lv.1~20 공용 투구', 1, 50),
        (401, '초급 가죽 갑옷',   'armor','common','chest', '{"vit":8,"str":3}',           'Lv.1~20 공용 갑옷', 1, 80),
        (402, '초급 가죽 장화',   'armor','common','boots', '{"vit":4,"spd":10,"dex":2}',  'Lv.1~20 공용 장화', 1, 50)
      `);

      // ── Lv.21~40 중급 방어구 (rare) ──
      await query(`INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
        (410, '중급 철 투구',     'armor','rare','helm',  '{"vit":12,"dex":5,"str":3}',       'Lv.21~40 공용 투구', 1, 300),
        (411, '중급 체인 갑옷',   'armor','rare','chest', '{"vit":18,"str":8,"dex":3}',       'Lv.21~40 공용 갑옷', 1, 500),
        (412, '중급 철 장화',     'armor','rare','boots', '{"vit":10,"spd":20,"dex":5}',      'Lv.21~40 공용 장화', 1, 300)
      `);

      // ── Lv.41~60 상급 방어구 (epic) ──
      await query(`INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
        (420, '상급 용린 투구',   'armor','epic','helm',  '{"vit":22,"dex":10,"str":6,"cri":3}',   'Lv.41~60 공용 투구', 1, 1500),
        (421, '상급 용린 갑주',   'armor','epic','chest', '{"vit":32,"str":14,"dex":6,"int":6}',   'Lv.41~60 공용 갑옷', 1, 2500),
        (422, '상급 용린 장화',   'armor','epic','boots', '{"vit":18,"spd":35,"dex":10,"cri":2}',  'Lv.41~60 공용 장화', 1, 1500)
      `);

      // ── Lv.61~80 전설 방어구 (legendary) ──
      await query(`INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price) VALUES
        (430, '전설의 왕관',      'armor','legendary','helm',  '{"vit":35,"dex":16,"str":10,"int":10,"cri":5}',  'Lv.61~80 공용 투구', 1, 5000),
        (431, '전설의 갑주',      'armor','legendary','chest', '{"vit":50,"str":22,"dex":10,"int":10,"cri":4}',  'Lv.61~80 공용 갑옷', 1, 8000),
        (432, '전설의 장화',      'armor','legendary','boots', '{"vit":30,"spd":55,"dex":16,"cri":4}',           'Lv.61~80 공용 장화', 1, 5000)
      `);

      // ── 몬스터 드랍에 방어구 추가 (레벨 맞게, 1% 확률) ──
      // Lv.1~20 몬스터 → 초급 방어구
      const lv1to20 = [1,2,3,10,11,12,20,21];
      for (const mid of lv1to20) {
        await query(`UPDATE monsters SET drop_table = COALESCE(drop_table, '[]'::jsonb) || $1::jsonb WHERE id = $2`,
          [JSON.stringify([
            {itemId:400, chance:0.01, minQty:1, maxQty:1},
            {itemId:401, chance:0.01, minQty:1, maxQty:1},
            {itemId:402, chance:0.01, minQty:1, maxQty:1},
          ]), mid]);
      }

      // Lv.21~40 몬스터 → 중급 방어구
      const lv21to40 = [30,31,40,41,50,51,60,61,70,80,81,90,91];
      for (const mid of lv21to40) {
        await query(`UPDATE monsters SET drop_table = COALESCE(drop_table, '[]'::jsonb) || $1::jsonb WHERE id = $2`,
          [JSON.stringify([
            {itemId:410, chance:0.01, minQty:1, maxQty:1},
            {itemId:411, chance:0.01, minQty:1, maxQty:1},
            {itemId:412, chance:0.01, minQty:1, maxQty:1},
          ]), mid]);
      }

      // Lv.41~60 몬스터 → 상급 방어구
      const lv41to60 = [100,101,110,120,121,122,123,130];
      for (const mid of lv41to60) {
        await query(`UPDATE monsters SET drop_table = COALESCE(drop_table, '[]'::jsonb) || $1::jsonb WHERE id = $2`,
          [JSON.stringify([
            {itemId:420, chance:0.01, minQty:1, maxQty:1},
            {itemId:421, chance:0.01, minQty:1, maxQty:1},
            {itemId:422, chance:0.01, minQty:1, maxQty:1},
          ]), mid]);
      }

      // Lv.61~80 몬스터 → 전설 방어구
      const lv61to80 = [124,125,126,127,128,129,135];
      for (const mid of lv61to80) {
        await query(`UPDATE monsters SET drop_table = COALESCE(drop_table, '[]'::jsonb) || $1::jsonb WHERE id = $2`,
          [JSON.stringify([
            {itemId:430, chance:0.01, minQty:1, maxQty:1},
            {itemId:431, chance:0.01, minQty:1, maxQty:1},
            {itemId:432, chance:0.01, minQty:1, maxQty:1},
          ]), mid]);
      }

      // 몬스터 드랍테이블에서 삭제된 아이템 제거
      const allMonsters = await query<{ id: number; drop_table: any[] }>(`SELECT id, drop_table FROM monsters WHERE drop_table IS NOT NULL`);
      const validItems = await query<{ id: number }>(`SELECT id FROM items`);
      const validSet = new Set(validItems.rows.map(r => r.id));
      for (const m of allMonsters.rows) {
        if (!Array.isArray(m.drop_table)) continue;
        const cleaned = m.drop_table.filter((d: any) => validSet.has(d.itemId));
        if (cleaned.length !== m.drop_table.length) {
          await query(`UPDATE monsters SET drop_table = $1::jsonb WHERE id = $2`, [JSON.stringify(cleaned), m.id]);
        }
      }

      await query(`INSERT INTO _migrations (name) VALUES ('armor_unify_v1')`);
      console.log('[migration] armor_unify_v1: 완료 (12 방어구 + 드랍 정리)');
    } catch (e) {
      console.error('[migration] armor_unify_v1 error:', e);
    }
  }
  // 현타/코피에 상급 용린세트 3옵 지급
  {
    try {
      const itemCheck2 = await query(`SELECT 1 FROM items WHERE id = 420`);
      if (!itemCheck2.rowCount || itemCheck2.rowCount === 0) return;

      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'grant_armor_hyunta_copi_v2'`);
      if (applied.rowCount && applied.rowCount > 0) return;

      const charNames = ['현타', '코피'];
      const armorIds = [420, 421, 422]; // 상급 용린 투구/갑주/장화

      const allPrefixes = await query<{ id: number; name: string; tier: number; stat_key: string; min_val: number; max_val: number }>(
        'SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes ORDER BY id'
      );

      for (const cname of charNames) {
        const cr = await query<{ id: number }>(`SELECT id FROM characters WHERE name = $1`, [cname]);
        if (cr.rowCount === 0) continue;
        const cid = cr.rows[0].id;

        for (const itemId of armorIds) {
          // 3옵 접두사 생성
          const prefixIds: number[] = [];
          const bonusStats: Record<string, number> = {};
          const usedKeys = new Set<string>();
          for (let i = 0; i < 3; i++) {
            const tRoll = Math.random() * 100;
            let tier: number;
            if (tRoll < 5) tier = 4;
            else if (tRoll < 20) tier = 3;
            else if (tRoll < 50) tier = 2;
            else tier = 1;
            const candidates = allPrefixes.rows.filter(p => p.tier === tier && !usedKeys.has(p.stat_key));
            if (candidates.length === 0) continue;
            const pf = candidates[Math.floor(Math.random() * candidates.length)];
            const val = pf.min_val + Math.floor(Math.random() * (pf.max_val - pf.min_val + 1));
            prefixIds.push(pf.id);
            bonusStats[pf.stat_key] = (bonusStats[pf.stat_key] ?? 0) + val;
            usedKeys.add(pf.stat_key);
          }

          // 빈 인벤토리 슬롯 찾기
          const usedR = await query<{ slot_index: number }>('SELECT slot_index FROM character_inventory WHERE character_id = $1', [cid]);
          const used = new Set(usedR.rows.map(r => r.slot_index));
          let freeSlot = -1;
          for (let i = 0; i < 60; i++) { if (!used.has(i)) { freeSlot = i; break; } }
          if (freeSlot < 0) continue;

          await query(
            `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, prefix_ids, prefix_stats) VALUES ($1, $2, $3, 1, $4, $5::jsonb)`,
            [cid, itemId, freeSlot, prefixIds, JSON.stringify(bonusStats)]
          );
        }
        console.log(`[grant] ${cname}: 상급 용린세트 3옵 지급 완료`);
      }

      await query(`INSERT INTO _migrations (name) VALUES ('grant_armor_hyunta_copi_v2')`);
    } catch (e) {
      console.error('[grant] armor error:', e);
    }
  }
  // 모든 유저에게 중급 방어구 2옵세트 지급 (재지급)
  {
    try {
      // 아이템 410이 존재하는지 먼저 확인 (armor_unify_v1 완료 대기)
      const itemCheck = await query(`SELECT 1 FROM items WHERE id = 410`);
      if (!itemCheck.rowCount || itemCheck.rowCount === 0) return; // 아직 방어구 생성 안 됨

      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'grant_mid_armor_all_v2'`);
      if (applied.rowCount && applied.rowCount > 0) return;

      const allChars = await query<{ id: number; name: string }>(`SELECT id, name FROM characters`);
      if (allChars.rowCount === 0) return;

      const allPrefixes = await query<{ id: number; name: string; tier: number; stat_key: string; min_val: number; max_val: number }>(
        'SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes ORDER BY id'
      );
      const armorIds = [410, 411, 412]; // 중급 철 투구/체인 갑옷/철 장화

      for (const c of allChars.rows) {
        for (const itemId of armorIds) {
          const prefixIds: number[] = [];
          const bonusStats: Record<string, number> = {};
          const usedKeys = new Set<string>();
          for (let i = 0; i < 2; i++) {
            const tRoll = Math.random() * 100;
            let tier: number;
            if (tRoll < 3) tier = 3;
            else if (tRoll < 20) tier = 2;
            else tier = 1;
            const candidates = allPrefixes.rows.filter(p => p.tier === tier && !usedKeys.has(p.stat_key));
            if (candidates.length === 0) continue;
            const pf = candidates[Math.floor(Math.random() * candidates.length)];
            const val = pf.min_val + Math.floor(Math.random() * (pf.max_val - pf.min_val + 1));
            prefixIds.push(pf.id);
            bonusStats[pf.stat_key] = (bonusStats[pf.stat_key] ?? 0) + val;
            usedKeys.add(pf.stat_key);
          }

          const usedR = await query<{ slot_index: number }>('SELECT slot_index FROM character_inventory WHERE character_id = $1', [c.id]);
          const used = new Set(usedR.rows.map(r => r.slot_index));
          let freeSlot = -1;
          for (let i = 0; i < 60; i++) { if (!used.has(i)) { freeSlot = i; break; } }
          if (freeSlot < 0) continue;

          await query(
            `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, prefix_ids, prefix_stats) VALUES ($1, $2, $3, 1, $4, $5::jsonb)`,
            [c.id, itemId, freeSlot, prefixIds, JSON.stringify(bonusStats)]
          );
        }
      }

      await query(`INSERT INTO _migrations (name) VALUES ('grant_mid_armor_all_v2')`);
      console.log(`[grant] 중급 방어구 2옵 세트 재지급: ${allChars.rowCount}캐릭터 완료`);
    } catch (e) {
      console.error('[grant] mid armor all error:', e);
    }
  }
  // 방어구 재지급 + 전체 몬스터 드랍테이블 세팅 (15초 딜레이로 다른 마이그레이션 완료 후 실행)
  {
    try {
      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'full_drop_setup_v4'`);
      if (applied.rowCount && applied.rowCount > 0) return;
      // 방어구 아이템 존재 확인 (armor_unify_v1 완료 여부)
      const check = await query(`SELECT 1 FROM items WHERE id = 400`);
      if (!check.rowCount) {
        console.log('[migration] full_drop_setup_v3: 방어구 미생성 — 스킵');
        return;
      }

      console.log('[migration] full_drop_setup_v4: 드랍테이블 완전 리셋...');
      // 먼저 모든 몬스터 드랍 완전 초기화
      await query(`UPDATE monsters SET drop_table = '[]'::jsonb`);

      const allPrefixes = await query<{ id: number; name: string; tier: number; stat_key: string; min_val: number; max_val: number }>(
        'SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes ORDER BY id'
      );

      function rollPrefixes(count: number, luckBoost = false) {
        const prefixIds: number[] = [];
        const bonusStats: Record<string, number> = {};
        const usedKeys = new Set<string>();
        for (let i = 0; i < count; i++) {
          const tRoll = Math.random() * 100;
          let tier: number;
          if (luckBoost) { tier = tRoll < 5 ? 4 : tRoll < 20 ? 3 : tRoll < 50 ? 2 : 1; }
          else { tier = tRoll < 3 ? 3 : tRoll < 20 ? 2 : 1; }
          const candidates = allPrefixes.rows.filter(p => p.tier === tier && !usedKeys.has(p.stat_key));
          if (candidates.length === 0) continue;
          const pf = candidates[Math.floor(Math.random() * candidates.length)];
          const val = pf.min_val + Math.floor(Math.random() * (pf.max_val - pf.min_val + 1));
          prefixIds.push(pf.id);
          bonusStats[pf.stat_key] = (bonusStats[pf.stat_key] ?? 0) + val;
          usedKeys.add(pf.stat_key);
        }
        return { prefixIds, bonusStats };
      }

      async function grantItem(cid: number, itemId: number, prefixCount: number, luck = false) {
        const usedR = await query<{ slot_index: number }>('SELECT slot_index FROM character_inventory WHERE character_id = $1', [cid]);
        const used = new Set(usedR.rows.map(r => r.slot_index));
        let freeSlot = -1;
        for (let i = 0; i < 60; i++) { if (!used.has(i)) { freeSlot = i; break; } }
        if (freeSlot < 0) return;
        const { prefixIds, bonusStats } = rollPrefixes(prefixCount, luck);
        await query(`INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, prefix_ids, prefix_stats) VALUES ($1,$2,$3,1,$4,$5::jsonb)`,
          [cid, itemId, freeSlot, prefixIds.length > 0 ? prefixIds : [], JSON.stringify(bonusStats)]);
      }

      // 1) 모든 캐릭터에 중급 방어구 2옵 지급
      const allChars = await query<{ id: number; name: string }>('SELECT id, name FROM characters');
      for (const c of allChars.rows) {
        await grantItem(c.id, 410, 2);
        await grantItem(c.id, 411, 2);
        await grantItem(c.id, 412, 2);
      }
      console.log(`  중급 방어구: ${allChars.rowCount}캐릭터 지급`);

      // 2) 현타/코피에 상급 용린 3옵
      for (const name of ['현타', '코피']) {
        const cr = await query<{ id: number }>('SELECT id FROM characters WHERE name = $1', [name]);
        if (cr.rowCount === 0) continue;
        await grantItem(cr.rows[0].id, 420, 3, true);
        await grantItem(cr.rows[0].id, 421, 3, true);
        await grantItem(cr.rows[0].id, 422, 3, true);
        console.log(`  ${name}: 상급 용린 3옵 지급`);
      }

      // 3) 전체 몬스터 드랍테이블 재설정

      const monsters = await query<{ id: number; level: number; drop_table: any[] }>(
        'SELECT id, level, drop_table FROM monsters'
      );

      // 레벨대별 드랍 아이템 정의
      // Lv.1~12: 초급무기(1-5) + 초급방어구(400-402) + 초급악세(20,21)
      // Lv.12~30: common/rare무기(200-215,220-222) + 중급방어구(410-412) + rare악세(270-274,280-283)
      // Lv.30~50: epic무기(203-205,213-215,223-225) + 상급방어구(420-422) + epic악세(275-277,284,340,342)
      // Lv.50~70: legendary무기(206,207,216,217,226,227,300-323) + 전설방어구(430-432) + legend악세(278,285,341,343)

      const dropTiers: { minLv: number; maxLv: number; weapons: number[]; armors: number[]; accessories: number[]; wChance: number; aChance: number; accChance: number }[] = [
        { minLv: 1, maxLv: 12,
          weapons: [1,2,3,4,5],
          armors: [400,401,402],
          accessories: [20,21],
          wChance: 0.02, aChance: 0.01, accChance: 0.005 },
        { minLv: 12, maxLv: 30,
          weapons: [200,201,202,210,211,212,220,221,222],
          armors: [410,411,412],
          accessories: [270,271,272,273,274,280,281,282,283],
          wChance: 0.015, aChance: 0.01, accChance: 0.005 },
        { minLv: 30, maxLv: 50,
          weapons: [203,204,205,213,214,215,223,224,225],
          armors: [420,421,422],
          accessories: [275,276,277,284,340,342],
          wChance: 0.01, aChance: 0.008, accChance: 0.004 },
        { minLv: 50, maxLv: 999,
          weapons: [206,207,216,217,226,227,300,301,302,303,310,311,312,313,320,321,322,323],
          armors: [430,431,432],
          accessories: [278,285,341,343],
          wChance: 0.008, aChance: 0.006, accChance: 0.003 },
      ];

      // 레벨별 포션 드랍
      const potionByLevel: { minLv: number; maxLv: number; potionId: number; chance: number; min: number; max: number }[] = [
        { minLv: 1, maxLv: 12, potionId: 100, chance: 0.3, min: 1, max: 2 },   // 작은 체력 물약
        { minLv: 12, maxLv: 30, potionId: 102, chance: 0.25, min: 1, max: 2 },  // 중급 체력 물약
        { minLv: 30, maxLv: 50, potionId: 104, chance: 0.2, min: 1, max: 2 },   // 고급 체력 물약
        { minLv: 50, maxLv: 999, potionId: 106, chance: 0.15, min: 1, max: 2 }, // 최상급 체력 물약
      ];

      for (const m of monsters.rows) {
        const drops: any[] = [];

        // 포션 추가
        const potionTier = potionByLevel.find(p => m.level >= p.minLv && m.level < p.maxLv) || potionByLevel[potionByLevel.length - 1];
        drops.push({ itemId: potionTier.potionId, chance: potionTier.chance, minQty: potionTier.min, maxQty: potionTier.max });

        // 레벨에 맞는 장비 드랍 추가
        const tier = dropTiers.find(t => m.level >= t.minLv && m.level < t.maxLv) || dropTiers[dropTiers.length - 1];

        // 무기 2~3개 랜덤 선택
        const wPick = tier.weapons.sort(() => Math.random() - 0.5).slice(0, Math.min(3, tier.weapons.length));
        for (const wid of wPick) {
          drops.push({ itemId: wid, chance: tier.wChance, minQty: 1, maxQty: 1 });
        }
        // 방어구 전부
        for (const aid of tier.armors) {
          drops.push({ itemId: aid, chance: tier.aChance, minQty: 1, maxQty: 1 });
        }
        // 악세서리 2개 랜덤
        const accPick = tier.accessories.sort(() => Math.random() - 0.5).slice(0, Math.min(2, tier.accessories.length));
        for (const acid of accPick) {
          drops.push({ itemId: acid, chance: tier.accChance, minQty: 1, maxQty: 1 });
        }

        await query('UPDATE monsters SET drop_table = $1::jsonb WHERE id = $2', [JSON.stringify(drops), m.id]);
      }
      console.log(`  드랍테이블: ${monsters.rowCount}마리 몬스터 재설정`);

      await query(`INSERT INTO _migrations (name) VALUES ('full_drop_setup_v4')`);
      console.log('[migration] full_drop_setup_v3: 완료');
    } catch (e) {
      console.error('[migration] full_drop_setup_v3 error:', e);
    }
  }
  // 드랍테이블 강제 재정리 (삭제된 아이템 제거) — 다른 마이그레이션 완료 후 실행
  {
    try {
      const allMonsters = await query<{ id: number; drop_table: any[] }>(`SELECT id, drop_table FROM monsters WHERE drop_table IS NOT NULL`);
      const validItems = await query<{ id: number }>(`SELECT id FROM items`);
      const validSet = new Set(validItems.rows.map(r => r.id));
      let fixed = 0;
      for (const m of allMonsters.rows) {
        if (!Array.isArray(m.drop_table)) continue;
        const cleaned = m.drop_table.filter((d: any) => validSet.has(d.itemId));
        if (cleaned.length !== m.drop_table.length) {
          await query(`UPDATE monsters SET drop_table = $1::jsonb WHERE id = $2`, [JSON.stringify(cleaned), m.id]);
          fixed++;
        }
      }
      if (fixed > 0) console.log(`[cleanup] 드랍테이블 정리: ${fixed}마리 몬스터`);
      // 인벤토리/장착에서도 삭제된 아이템 정리
      await query(`DELETE FROM character_inventory WHERE item_id NOT IN (SELECT id FROM items)`);
      await query(`DELETE FROM character_equipped WHERE item_id NOT IN (SELECT id FROM items)`);
    } catch (e) {
      console.error('[cleanup] drop_table error:', e);
    }
  }
  // 밸런스 v3: 몬스터 강화 + 치명타 소급 보정
  {
    try {
      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'balance_v3'`);
      if (applied.rowCount && applied.rowCount > 0) return;
      console.log('[migration] balance_v3: 몬스터 HP/스탯 강화 + 치명타 보정...');

      // 몬스터 HP x2, 공방 x1.5
      await query(`UPDATE monsters SET max_hp = max_hp * 2`);
      await query(`UPDATE monsters SET stats = jsonb_set(jsonb_set(
        stats,
        '{str}', (COALESCE((stats->>'str')::int,0) * 1.5)::int::text::jsonb),
        '{vit}', (COALESCE((stats->>'vit')::int,0) * 1.5)::int::text::jsonb)`);

      // 모든 캐릭터 치명타 스탯 보정 (성장치 하향 소급)
      const CLASS_START: Record<string, number> = { warrior: 5, mage: 6, cleric: 4, rogue: 12 };
      const CLASS_CRI_GROWTH: Record<string, number> = { warrior: 0.1, mage: 0.1, cleric: 0.1, rogue: 0.2 };
      const chars = await query<{ id: number; level: number; class_name: string }>('SELECT id, level, class_name FROM characters');
      for (const c of chars.rows) {
        const startCri = CLASS_START[c.class_name] || 5;
        const growth = CLASS_CRI_GROWTH[c.class_name] || 0.1;
        const correctCri = Math.floor(startCri + growth * (c.level - 1));
        await query(`UPDATE characters SET stats = jsonb_set(stats, '{cri}', $1::text::jsonb) WHERE id = $2`, [correctCri, c.id]);
      }

      await query(`INSERT INTO _migrations (name) VALUES ('balance_v3')`);
      console.log('[migration] balance_v3: 완료');
    } catch (e) {
      console.error('[migration] balance_v3 error:', e);
    }
  }
  // 장비 레벨제한 + 스탯격차 확대
  {
    try {
      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'equip_level_req_v1'`);
      if (applied.rowCount && applied.rowCount > 0) return;
      console.log('[migration] equip_level_req_v1: 장비 레벨제한 + 스탯 격차...');

      // required_level 컬럼 추가
      await query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS required_level INT NOT NULL DEFAULT 1`);

      // 무기 레벨제한 설정
      await query(`UPDATE items SET required_level = 1 WHERE id IN (1,2,3,4,5)`); // 초급 무기
      await query(`UPDATE items SET required_level = 10 WHERE id IN (200,210,220)`); // common 무기
      await query(`UPDATE items SET required_level = 20 WHERE id IN (201,202,211,212,221,222)`); // rare 무기
      await query(`UPDATE items SET required_level = 35 WHERE id IN (203,204,205,213,214,215,223,224,225)`); // epic 무기
      await query(`UPDATE items SET required_level = 50 WHERE id IN (206,207,216,217,226,227)`); // legendary 무기
      await query(`UPDATE items SET required_level = 55 WHERE id IN (300,301,310,311,320,321)`); // Lv.50-70 epic
      await query(`UPDATE items SET required_level = 65 WHERE id IN (302,303,312,313,322,323)`); // Lv.50-70 legendary

      // 방어구 레벨제한
      await query(`UPDATE items SET required_level = 1  WHERE id IN (400,401,402)`);
      await query(`UPDATE items SET required_level = 21 WHERE id IN (410,411,412)`);
      await query(`UPDATE items SET required_level = 41 WHERE id IN (420,421,422)`);
      await query(`UPDATE items SET required_level = 61 WHERE id IN (430,431,432)`);

      // 악세서리 레벨제한
      await query(`UPDATE items SET required_level = 1  WHERE id IN (20,21)`);
      await query(`UPDATE items SET required_level = 10 WHERE id IN (270,271,280,281)`); // common
      await query(`UPDATE items SET required_level = 20 WHERE id IN (272,273,274,282,283)`); // rare
      await query(`UPDATE items SET required_level = 35 WHERE id IN (275,276,277,284)`); // epic
      await query(`UPDATE items SET required_level = 50 WHERE id IN (278,285)`); // legendary
      await query(`UPDATE items SET required_level = 55 WHERE id IN (340,342)`); // Lv.50-70 epic
      await query(`UPDATE items SET required_level = 65 WHERE id IN (341,343)`); // Lv.50-70 legendary

      // 방어구 스탯 격차 확대 (상위 등급이 확실히 강하게)
      // 초급 → 그대로
      // 중급 x1.5
      await query(`UPDATE items SET stats = '{"vit":18,"dex":8,"str":5}'::jsonb WHERE id = 410`);
      await query(`UPDATE items SET stats = '{"vit":28,"str":12,"dex":5}'::jsonb WHERE id = 411`);
      await query(`UPDATE items SET stats = '{"vit":15,"spd":30,"dex":8}'::jsonb WHERE id = 412`);
      // 상급 x3
      await query(`UPDATE items SET stats = '{"vit":40,"dex":18,"str":12,"cri":4}'::jsonb WHERE id = 420`);
      await query(`UPDATE items SET stats = '{"vit":55,"str":24,"dex":10,"int":10}'::jsonb WHERE id = 421`);
      await query(`UPDATE items SET stats = '{"vit":32,"spd":50,"dex":16,"cri":3}'::jsonb WHERE id = 422`);
      // 전설 x5
      await query(`UPDATE items SET stats = '{"vit":65,"dex":28,"str":18,"int":18,"cri":6}'::jsonb WHERE id = 430`);
      await query(`UPDATE items SET stats = '{"vit":90,"str":38,"dex":18,"int":18,"cri":5}'::jsonb WHERE id = 431`);
      await query(`UPDATE items SET stats = '{"vit":55,"spd":80,"dex":28,"cri":5}'::jsonb WHERE id = 432`);

      await query(`INSERT INTO _migrations (name) VALUES ('equip_level_req_v1')`);
      console.log('[migration] equip_level_req_v1: 완료');
    } catch (e) {
      console.error('[migration] equip_level_req_v1 error:', e);
    }
  }
  // 노드 치명타 너프 (3→1, 10→3)
  {
    try {
      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'node_cri_nerf_v2'`);
      if (applied.rowCount && applied.rowCount > 0) return;
      console.log('[migration] node_cri_nerf_v1...');

      // 노드 하나씩 직접 수정
      const nodes = await query<{ id: number; effects: any[] }>(`SELECT id, effects FROM node_definitions WHERE effects::text LIKE '%cri%' OR effects::text LIKE '%crit_damage%'`);
      let fixed = 0;
      for (const n of nodes.rows) {
        if (!Array.isArray(n.effects)) continue;
        let changed = false;
        const newEffects = n.effects.map((e: any) => {
          // cri stat: 3→1, 10→3
          if (e.type === 'stat' && e.stat === 'cri') {
            if (e.value >= 10) { changed = true; return { ...e, value: 3 }; }
            if (e.value >= 3) { changed = true; return { ...e, value: 1 }; }
          }
          // crit_damage: 10→3
          if (e.type === 'passive' && e.key === 'crit_damage' && e.value >= 10) {
            changed = true; return { ...e, value: 3 };
          }
          return e;
        });
        if (changed) {
          await query(`UPDATE node_definitions SET effects = $1::jsonb WHERE id = $2`, [JSON.stringify(newEffects), n.id]);
          fixed++;
        }
      }
      // description 업데이트
      await query(`UPDATE node_definitions SET description = REPLACE(description, '+3%', '+1%') WHERE description LIKE '%치명타 확률 +3%'`);
      await query(`UPDATE node_definitions SET description = REPLACE(description, '+10%', '+3%') WHERE description LIKE '%치명타 확률 +10%'`);
      await query(`UPDATE node_definitions SET description = REPLACE(description, '데미지 +10%', '데미지 +3%') WHERE description LIKE '%치명타 데미지 +10%'`);
      console.log(`  치명타 노드 ${fixed}개 너프 완료`);

      await query(`INSERT INTO _migrations (name) VALUES ('node_cri_nerf_v2')`);
      console.log('[migration] node_cri_nerf_v1: 완료');
    } catch (e) {
      console.error('[migration] node_cri_nerf_v1 error:', e);
    }
  }
  // 강타 체력비례뎀 추가
  {
    try {
      await query(`UPDATE skills SET effect_type = 'hp_pct_damage', effect_value = 10, description = 'ATK x150% + 적 HP 10% 추가 데미지' WHERE class_name = 'warrior' AND name = '강타' AND effect_type = 'damage'`);
    } catch (e) { console.error('[patch] 강타 error:', e); }
  }
  // 스킬 프리셋 테이블
  {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS character_skill_presets (
          character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
          preset_idx   INTEGER NOT NULL CHECK (preset_idx BETWEEN 1 AND 3),
          name         TEXT NOT NULL DEFAULT '',
          skill_ids    INTEGER[] NOT NULL DEFAULT '{}',
          PRIMARY KEY (character_id, preset_idx)
        )
      `);
    } catch (e) { console.error('[migration] skill_presets error:', e); }
  }
  // 깨진 prefix_stats 데이터 정리
  {
    try {
      // 문자열로 저장된 prefix_stats를 jsonb로 변환
      await query(`UPDATE character_inventory SET prefix_stats = '{}'::jsonb WHERE prefix_stats IS NULL`);
      await query(`UPDATE character_equipped SET prefix_stats = '{}'::jsonb WHERE prefix_stats IS NULL`);
      // 삭제된 아이템 참조 정리 (MP 물약 등)
      await query(`DELETE FROM character_inventory WHERE item_id NOT IN (SELECT id FROM items)`);
      await query(`DELETE FROM character_equipped WHERE item_id NOT IN (SELECT id FROM items)`);
    } catch (e) {
      console.error('[cleanup] prefix_stats/orphan items error:', e);
    }
  }
  console.log('[migrations] 모든 마이그레이션 순차 실행 완료');
}

async function runEquipOverhaul() {
  // ═══════════════════════════════════════════════
  // 장비 전면 개편 v3
  // ═══════════════════════════════════════════════
  await query(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`);
  {
    try {
      const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'equip_overhaul_v3'`);
      if (applied.rowCount && applied.rowCount > 0) {
        console.log('[migration] equip_overhaul_v3: 이미 적용됨');
      } else {
        console.log('[migration] equip_overhaul_v3: 장비 전면 개편 시작...');

        // 1) 모든 장비 아이템 완전 삭제 (모든 외래키 참조 정리)
        const equipIds = (await query<{id:number}>(`SELECT id FROM items WHERE slot IS NOT NULL`)).rows.map(r=>r.id);
        const allDelIds = [...new Set([...equipIds, ...Array.from({length:200},(_,i)=>i+1000)])];
        if (allDelIds.length > 0) {
          await query(`UPDATE mailbox SET item_id = NULL, item_quantity = 0 WHERE item_id = ANY($1::int[])`, [allDelIds]);
          await query(`DELETE FROM auctions WHERE item_id = ANY($1::int[])`, [allDelIds]);
          await query(`UPDATE quests SET reward_item_id = NULL, reward_item_qty = NULL WHERE reward_item_id = ANY($1::int[])`, [allDelIds]);
        }
        await query(`DELETE FROM character_inventory WHERE item_id IN (SELECT id FROM items WHERE slot IS NOT NULL)`);
        await query(`DELETE FROM character_equipped WHERE item_id IN (SELECT id FROM items WHERE slot IS NOT NULL)`);
        await query(`DELETE FROM items WHERE slot IS NOT NULL`);
        await query(`DELETE FROM character_inventory WHERE item_id >= 1000`);
        await query(`DELETE FROM character_equipped WHERE item_id >= 1000`);
        await query(`DELETE FROM items WHERE id >= 1000`);
        console.log('  기존 장비 전부 삭제 완료');

        // required_level 컬럼 보장
        await query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS required_level INT NOT NULL DEFAULT 1`);

        // 2) 신규 장비 생성
        // 레벨대: 1~15, 16~30, 31~50, 51~70
        // 등급 배율: common=1.0, rare=1.2, epic=1.4, legendary=2.0
        const tiers = [
          { lvl: 1,  label: '초급', maxLv: 15 },
          { lvl: 16, label: '중급', maxLv: 30 },
          { lvl: 31, label: '상급', maxLv: 50 },
          { lvl: 51, label: '전설', maxLv: 70 },
        ];
        const grades = [
          { g: 'common', mult: 1.0, label: '' },
          { g: 'rare', mult: 1.2, label: '정예 ' },
          { g: 'epic', mult: 1.4, label: '영웅 ' },
          { g: 'legendary', mult: 2.0, label: '전설 ' },
        ];

        // 기본 스탯 (레벨대별 기준값)
        const baseWeaponAtk = [15, 40, 80, 150];  // 물리/마법 공격
        const baseArmorDef = [8, 22, 45, 85];      // 방어력
        const baseArmorMdef = [5, 15, 30, 60];     // 마방
        const baseArmorHp = [30, 80, 160, 300];    // HP
        const baseAccAtk = [5, 14, 28, 55];        // 악세 공격
        const baseAccHp = [15, 40, 80, 150];       // 악세 HP
        const baseAccDef = [4, 11, 22, 42];        // 악세 방어

        let itemId = 1000; // 새 ID 시작
        const weaponIds: Record<string, Record<string, Record<string, number>>> = {}; // class -> tier -> grade -> id
        const armorIds: Record<string, Record<string, Record<string, number>>> = {};  // slot -> tier -> grade -> id
        const accIds: Record<string, Record<string, Record<string, number>>> = {};    // slot -> tier -> grade -> id

        // ── 무기 (직업별) ──
        const weaponClasses = [
          { cls: 'warrior', name: '대검', atkType: 'atk' },
          { cls: 'mage', name: '지팡이', atkType: 'matk' },
          { cls: 'cleric', name: '홀', atkType: 'matk' },
          { cls: 'rogue', name: '단검', atkType: 'atk' },
        ];
        for (let ti = 0; ti < tiers.length; ti++) {
          const t = tiers[ti];
          for (const g of grades) {
            for (const wc of weaponClasses) {
              const atk = Math.round(baseWeaponAtk[ti] * g.mult);
              const stats: Record<string, number> = {};
              stats[wc.atkType] = atk;
              const fullName = `${g.label}${t.label} ${wc.name}`;
              await query(
                `INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price, required_level)
                 VALUES ($1, $2, 'weapon', $3, 'weapon', $4::jsonb, $5, 1, $6, $7)
                 ON CONFLICT (id) DO UPDATE SET name=$2, grade=$3, stats=$4::jsonb, description=$5, sell_price=$6, required_level=$7`,
                [itemId, fullName, g.g, JSON.stringify(stats),
                 `Lv.${t.lvl}~${t.maxLv} ${wc.cls} 전용`,
                 Math.round(atk * 2), t.lvl]
              );
              if (!weaponIds[wc.cls]) weaponIds[wc.cls] = {};
              if (!weaponIds[wc.cls][ti]) weaponIds[wc.cls][ti] = {};
              weaponIds[wc.cls][ti][g.g] = itemId;
              itemId++;
            }
          }
        }
        console.log(`  무기 ${itemId - 1000}개 생성`);

        const armorStart = itemId;
        // ── 방어구 (공용) ──
        const armorSlots = [
          { slot: 'helm', name: '투구', statFn: (ti: number, mult: number) => ({ def: Math.round(baseArmorDef[ti] * 0.6 * mult), mdef: Math.round(baseArmorMdef[ti] * 0.6 * mult) }) },
          { slot: 'chest', name: '갑옷', statFn: (ti: number, mult: number) => ({ def: Math.round(baseArmorDef[ti] * mult), hp: Math.round(baseArmorHp[ti] * mult) }) },
          { slot: 'boots', name: '장화', statFn: (ti: number, mult: number) => ({ mdef: Math.round(baseArmorMdef[ti] * mult), hp: Math.round(baseArmorHp[ti] * 0.6 * mult) }) },
        ];
        for (let ti = 0; ti < tiers.length; ti++) {
          const t = tiers[ti];
          for (const g of grades) {
            for (const as of armorSlots) {
              const stats = as.statFn(ti, g.mult);
              const fullName = `${g.label}${t.label} ${as.name}`;
              await query(
                `INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price, required_level)
                 VALUES ($1, $2, 'armor', $3, $4, $5::jsonb, $6, 1, $7, $8)
                 ON CONFLICT (id) DO UPDATE SET name=$2, grade=$3, slot=$4, stats=$5::jsonb, description=$6, sell_price=$7, required_level=$8`,
                [itemId, fullName, g.g, as.slot, JSON.stringify(stats),
                 `Lv.${t.lvl}~${t.maxLv} 공용 ${as.name}`,
                 Math.round(Object.values(stats).reduce((a, b) => a + b, 0)), t.lvl]
              );
              if (!armorIds[as.slot]) armorIds[as.slot] = {};
              if (!armorIds[as.slot][ti]) armorIds[as.slot][ti] = {};
              armorIds[as.slot][ti][g.g] = itemId;
              itemId++;
            }
          }
        }
        console.log(`  방어구 ${itemId - armorStart}개 생성`);

        const accStart = itemId;
        // ── 악세서리 (공용) ──
        const accSlots = [
          { slot: 'ring', name: '반지', statFn: (ti: number, mult: number) => ({ atk: Math.round(baseAccAtk[ti] * mult), matk: Math.round(baseAccAtk[ti] * mult) }) },
          { slot: 'amulet', name: '목걸이', statFn: (ti: number, mult: number) => ({ hp: Math.round(baseAccHp[ti] * mult), def: Math.round(baseAccDef[ti] * mult) }) },
        ];
        for (let ti = 0; ti < tiers.length; ti++) {
          const t = tiers[ti];
          for (const g of grades) {
            for (const ac of accSlots) {
              const stats = ac.statFn(ti, g.mult);
              const fullName = `${g.label}${t.label} ${ac.name}`;
              await query(
                `INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price, required_level)
                 VALUES ($1, $2, 'accessory', $3, $4, $5::jsonb, $6, 1, $7, $8)
                 ON CONFLICT (id) DO UPDATE SET name=$2, grade=$3, slot=$4, stats=$5::jsonb, description=$6, sell_price=$7, required_level=$8`,
                [itemId, fullName, g.g, ac.slot, JSON.stringify(stats),
                 `Lv.${t.lvl}~${t.maxLv} 공용 ${ac.name}`,
                 Math.round(Object.values(stats).reduce((a, b) => a + b, 0)), t.lvl]
              );
              if (!accIds[ac.slot]) accIds[ac.slot] = {};
              if (!accIds[ac.slot][ti]) accIds[ac.slot][ti] = {};
              accIds[ac.slot][ti][g.g] = itemId;
              itemId++;
            }
          }
        }
        console.log(`  악세서리 ${itemId - accStart}개 생성`);

        // 3) 몬스터 드랍 테이블 완전 리셋
        await query(`UPDATE monsters SET drop_table = '[]'::jsonb`);
        const monsters = await query<{ id: number; level: number }>('SELECT id, level FROM monsters');

        // 포션
        const potions = [
          { minLv: 1, maxLv: 15, id: 100, chance: 0.3 },
          { minLv: 16, maxLv: 30, id: 102, chance: 0.25 },
          { minLv: 31, maxLv: 50, id: 104, chance: 0.2 },
          { minLv: 51, maxLv: 999, id: 106, chance: 0.15 },
        ];
        const tierForLevel = (lv: number) => lv <= 15 ? 0 : lv <= 30 ? 1 : lv <= 50 ? 2 : 3;

        for (const m of monsters.rows) {
          const drops: any[] = [];
          const ti = tierForLevel(m.level);

          // 포션
          const pot = potions.find(p => m.level >= p.minLv && m.level <= p.maxLv) || potions[3];
          drops.push({ itemId: pot.id, chance: pot.chance, minQty: 1, maxQty: 2 });

          // 등급 비율: 일반50% 매직30% 에픽19% 전설1%
          const wBase = 0.03; // 무기 전체 3%
          for (const wc of weaponClasses) {
            drops.push({ itemId: weaponIds[wc.cls][ti]['common'], chance: wBase*0.50, minQty: 1, maxQty: 1 });
            drops.push({ itemId: weaponIds[wc.cls][ti]['rare'], chance: wBase*0.30, minQty: 1, maxQty: 1 });
            drops.push({ itemId: weaponIds[wc.cls][ti]['epic'], chance: wBase*0.19, minQty: 1, maxQty: 1 });
            drops.push({ itemId: weaponIds[wc.cls][ti]['legendary'], chance: wBase*0.01, minQty: 1, maxQty: 1 });
          }
          const aBase = 0.02; // 방어구 전체 2%
          for (const as of armorSlots) {
            drops.push({ itemId: armorIds[as.slot][ti]['common'], chance: aBase*0.50, minQty: 1, maxQty: 1 });
            drops.push({ itemId: armorIds[as.slot][ti]['rare'], chance: aBase*0.30, minQty: 1, maxQty: 1 });
            drops.push({ itemId: armorIds[as.slot][ti]['epic'], chance: aBase*0.19, minQty: 1, maxQty: 1 });
            drops.push({ itemId: armorIds[as.slot][ti]['legendary'], chance: aBase*0.01, minQty: 1, maxQty: 1 });
          }
          const acBase = 0.015; // 악세 전체 1.5%
          for (const ac of accSlots) {
            drops.push({ itemId: accIds[ac.slot][ti]['common'], chance: acBase*0.50, minQty: 1, maxQty: 1 });
            drops.push({ itemId: accIds[ac.slot][ti]['rare'], chance: acBase*0.30, minQty: 1, maxQty: 1 });
            drops.push({ itemId: accIds[ac.slot][ti]['epic'], chance: acBase*0.19, minQty: 1, maxQty: 1 });
            drops.push({ itemId: accIds[ac.slot][ti]['legendary'], chance: acBase*0.01, minQty: 1, maxQty: 1 });
          }

          await query('UPDATE monsters SET drop_table = $1::jsonb WHERE id = $2', [JSON.stringify(drops), m.id]);
        }
        console.log(`  드랍테이블: ${monsters.rowCount}마리 재설정`);

        // 4) 모든 캐릭터에 레벨대 맞는 common 세트 2옵 + 무기 우편 지급
        const allPrefixes = await query<{ id: number; tier: number; stat_key: string; min_val: number; max_val: number }>(
          'SELECT id, tier, stat_key, min_val, max_val FROM item_prefixes ORDER BY id'
        );
        function rollPrefixes2(count: number) {
          const pIds: number[] = []; const bStats: Record<string, number> = {}; const used = new Set<string>();
          for (let i = 0; i < count; i++) {
            const tRoll = Math.random() * 100;
            const tier = tRoll < 3 ? 3 : tRoll < 20 ? 2 : 1;
            const cands = allPrefixes.rows.filter(p => p.tier === tier && !used.has(p.stat_key));
            if (cands.length === 0) continue;
            const pf = cands[Math.floor(Math.random() * cands.length)];
            const val = pf.min_val + Math.floor(Math.random() * (pf.max_val - pf.min_val + 1));
            pIds.push(pf.id); bStats[pf.stat_key] = (bStats[pf.stat_key] ?? 0) + val; used.add(pf.stat_key);
          }
          return { prefixIds: pIds, bonusStats: bStats };
        }

        const chars = await query<{ id: number; level: number; class_name: string }>('SELECT id, level, class_name FROM characters');
        for (const c of chars.rows) {
          const ti = tierForLevel(c.level);

          // 무기 (직업에 맞는 common)
          const weaponId = weaponIds[c.class_name]?.[ti]?.['common'];
          if (weaponId) {
            await query(`INSERT INTO mailbox (character_id, subject, body, item_id, item_quantity, gold) VALUES ($1, '장비 개편 보상', '레벨대 맞는 무기입니다.', $2, 1, 0)`,
              [c.id, weaponId]);
          }

          // 방어구 3부위 (common)
          for (const as of armorSlots) {
            const aId = armorIds[as.slot]?.[ti]?.['common'];
            if (!aId) continue;
            const { prefixIds, bonusStats } = rollPrefixes2(2);
            const usedR = await query<{ slot_index: number }>('SELECT slot_index FROM character_inventory WHERE character_id = $1', [c.id]);
            const usedSet = new Set(usedR.rows.map(r => r.slot_index));
            let freeSlot = -1;
            for (let i = 0; i < 100; i++) { if (!usedSet.has(i)) { freeSlot = i; break; } }
            if (freeSlot >= 0) {
              await query(`INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, prefix_ids, prefix_stats) VALUES ($1,$2,$3,1,$4,$5::jsonb)`,
                [c.id, aId, freeSlot, prefixIds.length > 0 ? prefixIds : [], JSON.stringify(bonusStats)]);
            }
          }

          // 악세서리 2부위 (common)
          for (const ac of accSlots) {
            const acId = accIds[ac.slot]?.[ti]?.['common'];
            if (!acId) continue;
            const { prefixIds, bonusStats } = rollPrefixes2(2);
            const usedR = await query<{ slot_index: number }>('SELECT slot_index FROM character_inventory WHERE character_id = $1', [c.id]);
            const usedSet = new Set(usedR.rows.map(r => r.slot_index));
            let freeSlot = -1;
            for (let i = 0; i < 100; i++) { if (!usedSet.has(i)) { freeSlot = i; break; } }
            if (freeSlot >= 0) {
              await query(`INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, prefix_ids, prefix_stats) VALUES ($1,$2,$3,1,$4,$5::jsonb)`,
                [c.id, acId, freeSlot, prefixIds.length > 0 ? prefixIds : [], JSON.stringify(bonusStats)]);
            }
          }
        }
        console.log(`  ${chars.rowCount}캐릭터 장비 지급 완료`);

        // 삭제된 아이템 정리
        await query(`DELETE FROM character_inventory WHERE item_id NOT IN (SELECT id FROM items)`);
        await query(`DELETE FROM character_equipped WHERE item_id NOT IN (SELECT id FROM items)`);

        await query(`INSERT INTO _migrations (name) VALUES ('equip_overhaul_v3')`);
        console.log('[migration] equip_overhaul_v3: 완료');
      }
    } catch (e) {
      console.error('[migration] equip_overhaul_v3 error:', e);
    }
  }
}

// 경매 만료 정산 (1분마다)
setInterval(() => {
  settleExpiredAuctions().catch((e) => console.error('[auction] settle error', e));
}, 60_000);

// 월드 이벤트 스폰/만료 체크 (1분마다)
setInterval(() => {
  checkAndSpawnWorldEvent(io).catch((e) => console.error('[world-event] spawn error', e));
  checkExpiredWorldEvents(io).catch((e) => console.error('[world-event] expire error', e));
}, 60_000);
// cache-bust 1775586457
