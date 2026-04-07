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
  // 기존 캐릭터 레벨업 스탯 소급 적용 (밸런스 v2)
  (async () => {
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
  })();
  // 성직자 Lv.1 공격스킬 추가 마이그레이션
  (async () => {
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
  })();
  // 직업별 스킬 4개씩 추가 마이그레이션
  (async () => {
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
  })();
  // MP 물약 제거 마이그레이션
  (async () => {
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
  })();
  // 방어구 통일화 마이그레이션
  (async () => {
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

      await query(`INSERT INTO _migrations (name) VALUES ('armor_unify_v1')`);
      console.log('[migration] armor_unify_v1: 완료 (12 방어구 + 드랍 설정)');
    } catch (e) {
      console.error('[migration] armor_unify_v1 error:', e);
    }
  })();
  // 강타 체력비례뎀 추가
  (async () => {
    try {
      await query(`UPDATE skills SET effect_type = 'hp_pct_damage', effect_value = 10, description = 'ATK x150% + 적 HP 10% 추가 데미지' WHERE class_name = 'warrior' AND name = '강타' AND effect_type = 'damage'`);
    } catch (e) { console.error('[patch] 강타 error:', e); }
  })();
  // 깨진 prefix_stats 데이터 정리
  (async () => {
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
