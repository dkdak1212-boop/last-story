import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { adminRequired } from '../middleware/admin.js';
import { addItemToInventory, deliverToMailbox } from '../game/inventory.js';
import { getIo } from '../ws/io.js';
import { getActiveEvent, finishEvent } from '../game/worldEvent.js';
import { stopCombatSession, getKillStats, invalidateSessionMeta } from '../combat/engine.js';
import { CLASS_START, type ClassName } from '../game/classes.js';

const router = Router();
router.use(authRequired);
router.use(adminRequired);

// ========== 서버 통계 ==========
router.get('/stats', async (_req, res) => {
  const users = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users');
  const chars = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM characters');
  const active24h = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM characters WHERE last_online_at > NOW() - INTERVAL '24 hours'`
  );
  const guilds = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM guilds');
  const auctions = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM auctions WHERE settled = FALSE AND cancelled = FALSE`
  );
  const openFeedback = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM feedback WHERE status IN ('open','reviewing')`
  );
  const topLevel = await query<{ name: string; level: number }>(
    `SELECT name, level FROM characters ORDER BY level DESC LIMIT 1`
  );
  const topGold = await query<{ name: string; gold: string }>(
    `SELECT name, gold FROM characters ORDER BY gold DESC LIMIT 1`
  );
  // 온라인 전투 중 세션 수
  const combatSessions = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM combat_sessions');
  // 총 우편 수
  const mails = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM mailbox WHERE read_at IS NULL');
  res.json({
    totalUsers: Number(users.rows[0].count),
    totalCharacters: Number(chars.rows[0].count),
    active24h: Number(active24h.rows[0].count),
    totalGuilds: Number(guilds.rows[0].count),
    openAuctions: Number(auctions.rows[0].count),
    openFeedback: Number(openFeedback.rows[0].count),
    combatSessions: Number(combatSessions.rows[0].count),
    pendingMails: Number(mails.rows[0].count),
    topLevel: topLevel.rows[0] ? `${topLevel.rows[0].name} (Lv.${topLevel.rows[0].level})` : '—',
    topGold: topGold.rows[0] ? `${topGold.rows[0].name} (${Number(topGold.rows[0].gold).toLocaleString()}G)` : '—',
  });
});

// ========== 스탯/노드 포인트 오버 감사 ==========
// 레벨 L 기준 기댓값: 스탯 (L-1)×2, 노드 L-1
// 소비(할당+spent) + 미소비(stat_points/node_points) 가 기댓값 초과하면 오버
router.get('/stat-node-audit', async (_req, res) => {
  const chars = await query<{
    id: number; name: string; user_id: number; class_name: string; level: number;
    stats: Record<string, number>; stat_points: number | null; node_points: number;
  }>(
    `SELECT id, name, user_id, class_name, level,
            stats, COALESCE(stat_points, 0) AS stat_points, node_points
       FROM characters`
  );
  const spent = await query<{ character_id: number; total: string }>(
    `SELECT cn.character_id, COALESCE(SUM(nd.cost), 0)::text AS total
       FROM character_nodes cn
       JOIN node_definitions nd ON nd.id = cn.node_id
      GROUP BY cn.character_id`
  );
  const spentMap = new Map(spent.rows.map(r => [r.character_id, Number(r.total)]));

  const statOver: Array<{ id: number; name: string; level: number; allocated: number; unspent: number; expected: number; excess: number }> = [];
  const nodeOver: Array<{ id: number; name: string; level: number; spent: number; unspent: number; expected: number; excess: number }> = [];

  for (const c of chars.rows) {
    const start = CLASS_START[c.class_name as ClassName];
    if (!start) continue;
    const cur = c.stats || {};
    const allocated =
      Math.max(0, (cur.str ?? start.stats.str) - start.stats.str) +
      Math.max(0, (cur.dex ?? start.stats.dex) - start.stats.dex) +
      Math.max(0, (cur.int ?? start.stats.int) - start.stats.int) +
      Math.max(0, (cur.vit ?? start.stats.vit) - start.stats.vit);
    const expectedStat = Math.max(0, (c.level - 1) * 2);
    const totalStat = allocated + (c.stat_points || 0);
    if (totalStat > expectedStat) {
      statOver.push({ id: c.id, name: c.name, level: c.level, allocated, unspent: c.stat_points || 0, expected: expectedStat, excess: totalStat - expectedStat });
    }

    const nodeSpent = spentMap.get(c.id) || 0;
    const expectedNode = Math.max(0, c.level - 1);
    const totalNode = nodeSpent + c.node_points;
    if (totalNode > expectedNode) {
      nodeOver.push({ id: c.id, name: c.name, level: c.level, spent: nodeSpent, unspent: c.node_points, expected: expectedNode, excess: totalNode - expectedNode });
    }
  }

  res.json({
    totalCharacters: chars.rowCount,
    statOverflow: { count: statOver.length, totalExcess: statOver.reduce((s, x) => s + x.excess, 0), entries: statOver.slice(0, 50) },
    nodeOverflow: { count: nodeOver.length, totalExcess: nodeOver.reduce((s, x) => s + x.excess, 0), entries: nodeOver.slice(0, 50) },
  });
});

// 전 캐릭터 골드 sweep — 동레벨(±3) P75 대비 threshold 배수 초과 캐릭터 전수조사
router.get('/gold-sweep', async (req: AuthedRequest, res: Response) => {
  const threshold = Number(req.query.threshold) || 2.0; // default: P75 × 2
  const allR = await query<{ id: number; name: string; level: number; gold: string; class_name: string }>(
    `SELECT id, name, level, gold::text, class_name FROM characters`
  );
  const benchR = await query<{ level: number; p75: string; top: string }>(
    `SELECT level,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY gold))::text AS p75,
            MAX(gold)::text AS top
       FROM characters GROUP BY level`
  );
  const benchByLv = new Map<number, { p75: number; top: number }>();
  for (const r of benchR.rows) benchByLv.set(r.level, { p75: Number(r.p75), top: Number(r.top) });

  function bench(level: number) {
    let best = { p75: 0, top: 0 };
    for (let lv = level - 3; lv <= level + 3; lv++) {
      const b = benchByLv.get(lv);
      if (b && b.top > best.top) best = b;
    }
    return best;
  }

  const outliers = allR.rows
    .map(c => {
      const b = bench(c.level);
      const gold = Number(c.gold);
      const cap = Math.floor(b.p75 * threshold);
      return {
        id: c.id, name: c.name, level: c.level, className: c.class_name,
        gold, benchP75: b.p75, benchTop: b.top, cap,
        excessOverCap: Math.max(0, gold - cap),
        ratioP75: b.p75 > 0 ? gold / b.p75 : 0,
      };
    })
    .filter(c => c.excessOverCap > 0)
    .sort((a, b) => b.excessOverCap - a.excessOverCap);

  res.json({
    threshold,
    totalChars: allR.rowCount,
    outlierCount: outliers.length,
    totalExcess: outliers.reduce((s, x) => s + x.excessOverCap, 0),
    outliers: outliers.slice(0, 100),
  });
});

// 골드 sweep 결과를 기반으로 일괄 클램프 (각 캐릭을 자기 cap 값까지 낮춤)
router.post('/gold-sweep-clamp', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    threshold: z.number().positive().default(2.0),
    dryRun: z.boolean().default(true),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { threshold, dryRun } = parsed.data;

  const allR = await query<{ id: number; level: number; gold: string }>(
    `SELECT id, level, gold::text FROM characters`
  );
  const benchR = await query<{ level: number; p75: string }>(
    `SELECT level, (percentile_cont(0.75) WITHIN GROUP (ORDER BY gold))::text AS p75
       FROM characters GROUP BY level`
  );
  const benchByLv = new Map<number, number>();
  for (const r of benchR.rows) benchByLv.set(r.level, Number(r.p75));
  function p75Window(level: number): number {
    let top = 0;
    for (let lv = level - 3; lv <= level + 3; lv++) {
      const v = benchByLv.get(lv) || 0;
      if (v > top) top = v;
    }
    return top;
  }

  let charsClamped = 0, totalRemoved = 0;
  for (const c of allR.rows) {
    const gold = Number(c.gold);
    const cap = Math.floor(p75Window(c.level) * threshold);
    if (cap > 0 && gold > cap) {
      const removed = gold - cap;
      charsClamped++;
      totalRemoved += removed;
      if (!dryRun) {
        await query('UPDATE characters SET gold = $1 WHERE id = $2', [cap, c.id]);
      }
    }
  }
  res.json({ dryRun, threshold, charsClamped, totalRemoved });
});

// 할당 스탯이 기댓값 초과인 캐릭터 강제 정상화 (stats 리셋 + 포인트 재지급)
router.post('/force-reset-allocated', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterIds: z.array(z.number().int().positive()).min(1).max(200),
    dryRun: z.boolean().default(true),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterIds, dryRun } = parsed.data;

  const chars = await query<{
    id: number; name: string; class_name: string; level: number;
    stats: Record<string, number>; max_hp: number;
  }>(
    `SELECT id, name, class_name, level, stats, max_hp FROM characters WHERE id = ANY($1::int[])`,
    [characterIds]
  );
  const results: Array<{ id: number; name: string; level: number; statRefund: number; nodeRefund: number; hpRestored: number }> = [];
  for (const c of chars.rows) {
    const start = CLASS_START[c.class_name as ClassName];
    if (!start) continue;
    const cur = c.stats || {};
    const spentStr = Math.max(0, (cur.str ?? start.stats.str) - start.stats.str);
    const spentDex = Math.max(0, (cur.dex ?? start.stats.dex) - start.stats.dex);
    const spentInt = Math.max(0, (cur.int ?? start.stats.int) - start.stats.int);
    const spentVit = Math.max(0, (cur.vit ?? start.stats.vit) - start.stats.vit);
    const HP_PER_VIT = 20;
    const hpFromVit = spentVit * HP_PER_VIT;
    const statRefundTotal = spentStr + spentDex + spentInt + spentVit;

    const spentR = await query<{ total: string }>(
      `SELECT COALESCE(SUM(nd.cost), 0)::text AS total FROM character_nodes cn
         JOIN node_definitions nd ON nd.id = cn.node_id WHERE cn.character_id = $1`, [c.id]
    );
    const nodeSpent = Number(spentR.rows[0]?.total || 0);

    const newStats = { ...cur, str: start.stats.str, dex: start.stats.dex, int: start.stats.int, vit: start.stats.vit };
    const newMaxHp = Math.max(1, c.max_hp - hpFromVit);
    const expectedStat = Math.max(0, (c.level - 1) * 2);
    const expectedNode = Math.max(0, c.level - 1);

    results.push({ id: c.id, name: c.name, level: c.level, statRefund: statRefundTotal, nodeRefund: nodeSpent, hpRestored: hpFromVit });

    if (!dryRun) {
      await query(`DELETE FROM character_nodes WHERE character_id = $1`, [c.id]);
      await query(
        `UPDATE characters
            SET stats = $1::jsonb, max_hp = $2, hp = LEAST(hp, $2),
                stat_points = $3, node_points = $4
          WHERE id = $5`,
        [JSON.stringify(newStats), newMaxHp, expectedStat, expectedNode, c.id]
      );
    }
  }
  res.json({ dryRun, processed: results.length, results });
});

// 오버 캐릭터 골드 감사 — 동레벨 정상(오버없음) 유저 중앙값 대비 비교
router.post('/overflow-gold-audit', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ characterIds: z.array(z.number().int().positive()).min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const ids = parsed.data.characterIds;

  const targetR = await query<{ id: number; name: string; level: number; gold: string; class_name: string }>(
    `SELECT id, name, level, gold::text, class_name FROM characters WHERE id = ANY($1::int[])`,
    [ids]
  );

  // 정상 유저 (오버 리스트에 없는) 동레벨 ±3 중앙값
  const benchR = await query<{ level: number; median: string; p75: string; top: string }>(
    `SELECT level,
            (percentile_cont(0.5) WITHIN GROUP (ORDER BY gold))::text AS median,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY gold))::text AS p75,
            MAX(gold)::text AS top
       FROM characters
      WHERE id <> ALL($1::int[])
      GROUP BY level`,
    [ids]
  );
  const levelBench = new Map<number, { median: number; p75: number; top: number }>();
  for (const r of benchR.rows) {
    levelBench.set(r.level, { median: Number(r.median), p75: Number(r.p75), top: Number(r.top) });
  }

  function windowedBench(level: number) {
    let best = { median: 0, p75: 0, top: 0 };
    for (let lv = level - 3; lv <= level + 3; lv++) {
      const b = levelBench.get(lv);
      if (b && b.top > best.top) best = b;
    }
    return best;
  }

  const report = targetR.rows.map(c => {
    const bench = windowedBench(c.level);
    const gold = Number(c.gold);
    return {
      id: c.id, name: c.name, level: c.level, className: c.class_name,
      gold,
      benchMedian: bench.median,
      benchP75: bench.p75,
      benchTop: bench.top,
      excessOverP75: Math.max(0, gold - bench.p75),
    };
  }).sort((a, b) => b.gold - a.gold);

  res.json({
    targets: report.length,
    totalGold: report.reduce((s, x) => s + x.gold, 0),
    totalExcess: report.reduce((s, x) => s + x.excessOverP75, 0),
    report,
  });
});

// 오버 캐릭터 일괄 초기화: 스탯/노드 강제 리셋 + 골드 상한 지정
router.post('/normalize-overflow', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterIds: z.array(z.number().int().positive()).min(1).max(200),
    goldClamp: z.number().int().nonnegative().optional(), // 지정 시 이 값 초과 골드는 깎음
    dryRun: z.boolean().default(true),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterIds, goldClamp, dryRun } = parsed.data;

  const chars = await query<{
    id: number; name: string; class_name: string; level: number;
    stats: Record<string, number>; stat_points: number | null; node_points: number;
    max_hp: number; gold: string;
  }>(
    `SELECT id, name, class_name, level, stats,
            COALESCE(stat_points, 0) AS stat_points, node_points, max_hp, gold::text
       FROM characters WHERE id = ANY($1::int[])`,
    [characterIds]
  );

  const results: Array<{ id: number; name: string; level: number; statRefund: number; nodeRefund: number; hpRestored: number; goldClamped: number }> = [];

  for (const c of chars.rows) {
    const start = CLASS_START[c.class_name as ClassName];
    if (!start) continue;

    const cur = c.stats || {};
    const spentStr = Math.max(0, (cur.str ?? start.stats.str) - start.stats.str);
    const spentDex = Math.max(0, (cur.dex ?? start.stats.dex) - start.stats.dex);
    const spentInt = Math.max(0, (cur.int ?? start.stats.int) - start.stats.int);
    const spentVit = Math.max(0, (cur.vit ?? start.stats.vit) - start.stats.vit);
    const HP_PER_VIT = 20;
    const hpFromVit = spentVit * HP_PER_VIT;

    // 정상 한도까지 stat_points 지급 (L-1)*2
    const expectedStat = Math.max(0, (c.level - 1) * 2);
    const expectedNode = Math.max(0, c.level - 1);

    // 노드 spent 조회
    const spentR = await query<{ total: string }>(
      `SELECT COALESCE(SUM(nd.cost), 0)::text AS total
         FROM character_nodes cn JOIN node_definitions nd ON nd.id = cn.node_id
        WHERE cn.character_id = $1`, [c.id]
    );
    const nodeSpent = Number(spentR.rows[0]?.total || 0);

    const newStats = { ...cur, str: start.stats.str, dex: start.stats.dex, int: start.stats.int, vit: start.stats.vit };
    const newMaxHp = Math.max(1, c.max_hp - hpFromVit);

    const gold = Number(c.gold);
    const goldClamped = goldClamp !== undefined && gold > goldClamp ? gold - goldClamp : 0;
    const newGold = goldClamp !== undefined && gold > goldClamp ? goldClamp : gold;

    results.push({
      id: c.id, name: c.name, level: c.level,
      statRefund: spentStr + spentDex + spentInt + spentVit,
      nodeRefund: nodeSpent,
      hpRestored: hpFromVit,
      goldClamped,
    });

    if (!dryRun) {
      await query(`DELETE FROM character_nodes WHERE character_id = $1`, [c.id]);
      // stat/node 를 정확히 기댓값으로 세팅 (환불받아 expected 를 넘지 않도록)
      await query(
        `UPDATE characters
            SET stats = $1::jsonb,
                max_hp = $2,
                hp = LEAST(hp, $2),
                stat_points = $3,
                node_points = $4,
                gold = $5
          WHERE id = $6`,
        [JSON.stringify(newStats), newMaxHp, expectedStat, expectedNode, newGold, c.id]
      );
    }
  }

  res.json({ dryRun, processed: results.length, results });
});

// 오버분 정리 — 미소비 포인트(stat_points / node_points) 부터 차감
// 그래도 부족하면 allocated/spent 는 건드리지 않음 (리포트에 남김)
router.post('/stat-node-fix', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ dryRun: z.boolean().default(true) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { dryRun } = parsed.data;

  const chars = await query<{
    id: number; class_name: string; level: number;
    stats: Record<string, number>; stat_points: number | null; node_points: number;
  }>(
    `SELECT id, class_name, level, stats,
            COALESCE(stat_points, 0) AS stat_points, node_points FROM characters`
  );
  const spent = await query<{ character_id: number; total: string }>(
    `SELECT cn.character_id, COALESCE(SUM(nd.cost), 0)::text AS total
       FROM character_nodes cn JOIN node_definitions nd ON nd.id = cn.node_id
      GROUP BY cn.character_id`
  );
  const spentMap = new Map(spent.rows.map(r => [r.character_id, Number(r.total)]));

  let statFixedChars = 0, statPointsRemoved = 0, statUnfixable = 0;
  let nodeFixedChars = 0, nodePointsRemoved = 0, nodeUnfixable = 0;

  for (const c of chars.rows) {
    const start = CLASS_START[c.class_name as ClassName];
    if (!start) continue;
    const cur = c.stats || {};
    const allocated =
      Math.max(0, (cur.str ?? start.stats.str) - start.stats.str) +
      Math.max(0, (cur.dex ?? start.stats.dex) - start.stats.dex) +
      Math.max(0, (cur.int ?? start.stats.int) - start.stats.int) +
      Math.max(0, (cur.vit ?? start.stats.vit) - start.stats.vit);
    const expectedStat = Math.max(0, (c.level - 1) * 2);
    const sp = c.stat_points || 0;
    const totalStat = allocated + sp;
    if (totalStat > expectedStat) {
      const excess = totalStat - expectedStat;
      const removable = Math.min(excess, sp);
      if (removable > 0) {
        statFixedChars++;
        statPointsRemoved += removable;
        if (!dryRun) {
          await query('UPDATE characters SET stat_points = stat_points - $1 WHERE id = $2', [removable, c.id]);
        }
      }
      if (removable < excess) statUnfixable++;
    }

    const nodeSpent = spentMap.get(c.id) || 0;
    const expectedNode = Math.max(0, c.level - 1);
    const totalNode = nodeSpent + c.node_points;
    if (totalNode > expectedNode) {
      const excess = totalNode - expectedNode;
      const removable = Math.min(excess, c.node_points);
      if (removable > 0) {
        nodeFixedChars++;
        nodePointsRemoved += removable;
        if (!dryRun) {
          await query('UPDATE characters SET node_points = node_points - $1 WHERE id = $2', [removable, c.id]);
        }
      }
      if (removable < excess) nodeUnfixable++;
    }
  }

  res.json({
    dryRun,
    statFix: { charsFixed: statFixedChars, pointsRemoved: statPointsRemoved, charsUnfixable: statUnfixable },
    nodeFix: { charsFixed: nodeFixedChars, pointsRemoved: nodePointsRemoved, charsUnfixable: nodeUnfixable },
  });
});

// ========== 공지 관리 ==========
router.get('/announcements', async (_req, res) => {
  const r = await query(
    `SELECT a.id, a.title, a.body, a.priority, a.active, a.created_at, a.expires_at,
            u.username AS author
     FROM announcements a LEFT JOIN users u ON u.id = a.author_id
     ORDER BY a.created_at DESC LIMIT 100`
  );
  res.json(r.rows);
});

router.post('/announcements', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    title: z.string().min(1).max(100),
    body: z.string().min(1).max(5000),
    priority: z.enum(['normal', 'important', 'urgent']).default('normal'),
    expiresAt: z.string().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  await query(
    `INSERT INTO announcements (title, body, priority, expires_at, author_id) VALUES ($1, $2, $3, $4, $5)`,
    [parsed.data.title, parsed.data.body, parsed.data.priority, parsed.data.expiresAt ?? null, req.userId]
  );
  res.json({ ok: true });
});

router.post('/announcements/:id/toggle', async (req, res) => {
  await query('UPDATE announcements SET active = NOT active WHERE id = $1', [Number(req.params.id)]);
  res.json({ ok: true });
});

router.post('/announcements/:id/delete', async (req, res) => {
  await query('DELETE FROM announcements WHERE id = $1', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ========== 글로벌 이벤트 (서버 전체 EXP/골드/드랍 배율) ==========
router.get('/global-events', async (_req, res) => {
  const r = await query(
    `SELECT id, name, exp_mult, gold_mult, drop_mult, starts_at, ends_at, created_at,
            (ends_at > NOW()) AS is_active
     FROM global_events ORDER BY created_at DESC LIMIT 50`
  );
  res.json(r.rows);
});

router.post('/global-events', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    name: z.string().min(1).max(100),
    expMult: z.number().min(0.1).max(10),
    goldMult: z.number().min(0.1).max(10),
    dropMult: z.number().min(0.1).max(10),
    durationMinutes: z.number().int().min(1).max(10080), // 최대 7일
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input', detail: parsed.error.issues });
  try {
    // 안전: 테이블 보장 (마이그레이션 실패한 환경 대비)
    await query(`
      CREATE TABLE IF NOT EXISTS global_events (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL,
        exp_mult    NUMERIC NOT NULL DEFAULT 1.0,
        gold_mult   NUMERIC NOT NULL DEFAULT 1.0,
        drop_mult   NUMERIC NOT NULL DEFAULT 1.0,
        starts_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ends_at     TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const endsAt = new Date(Date.now() + parsed.data.durationMinutes * 60_000);
    const r = await query<{ id: number; ends_at: string }>(
      `INSERT INTO global_events (name, exp_mult, gold_mult, drop_mult, ends_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, ends_at`,
      [parsed.data.name, parsed.data.expMult, parsed.data.goldMult, parsed.data.dropMult, endsAt]
    );
    try {
      const { invalidateGlobalEventCache } = await import('../game/globalEvent.js');
      invalidateGlobalEventCache();
    } catch {}
    res.json({ ok: true, id: r.rows[0].id, endsAt: r.rows[0].ends_at });
  } catch (e: any) {
    console.error('[global-events POST] error:', e);
    res.status(500).json({ error: 'internal error', detail: e?.message || String(e) });
  }
});

router.post('/global-events/:id/end', async (req, res) => {
  await query(`UPDATE global_events SET ends_at = NOW() WHERE id = $1`, [Number(req.params.id)]);
  try {
    const { invalidateGlobalEventCache } = await import('../game/globalEvent.js');
    invalidateGlobalEventCache();
  } catch {}
  res.json({ ok: true });
});

// ========== 피드백 관리 ==========
router.get('/feedback', async (req, res) => {
  const status = (req.query.status as string) || '';
  const where = status ? 'WHERE f.status = $1' : '';
  const params = status ? [status] : [];
  const r = await query(
    `SELECT f.id, f.category, f.text, f.status, f.admin_note, f.created_at,
            u.username, c.name AS character_name
     FROM feedback f JOIN users u ON u.id = f.user_id
     LEFT JOIN characters c ON c.id = f.character_id
     ${where} ORDER BY f.created_at DESC LIMIT 100`,
    params
  );
  res.json(r.rows);
});

router.post('/feedback/:id/respond', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const parsed = z.object({
    status: z.enum(['open', 'reviewing', 'resolved', 'closed']),
    adminNote: z.string().max(2000).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  await query(
    `UPDATE feedback SET status = $1, admin_note = $2, updated_at = NOW() WHERE id = $3`,
    [parsed.data.status, parsed.data.adminNote ?? null, id]
  );
  res.json({ ok: true });
});

// ========== 개인 지급 (골드/경험치/아이템) ==========
router.post('/grant', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    gold: z.number().int().optional(),
    exp: z.number().int().optional(),
    itemId: z.number().int().positive().optional(),
    itemQty: z.number().int().min(1).max(999).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, gold, exp, itemId, itemQty } = parsed.data;

  const charR = await query<{ name: string }>('SELECT name FROM characters WHERE id = $1', [characterId]);
  if (charR.rowCount === 0) return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });

  const results: string[] = [];
  if (gold && gold !== 0) {
    await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [gold, characterId]);
    results.push(`골드 ${gold > 0 ? '+' : ''}${gold.toLocaleString()}G`);
  }
  if (exp && exp !== 0) {
    await query('UPDATE characters SET exp = exp + $1 WHERE id = $2', [exp, characterId]);
    results.push(`경험치 ${exp > 0 ? '+' : ''}${exp.toLocaleString()}`);
  }
  if (itemId && itemQty) {
    const { added, overflow } = await addItemToInventory(characterId, itemId, itemQty);
    if (overflow > 0) {
      await deliverToMailbox(characterId, '관리자 아이템 지급', '가방이 가득 차서 우편으로 배송되었습니다.', itemId, overflow);
    }
    results.push(`아이템 ${added}개 지급${overflow > 0 ? ` (${overflow}개 우편)` : ''}`);
  }
  res.json({ ok: true, message: `${charR.rows[0].name}: ${results.join(', ')}` });
});

// ========== 캐릭터 수정 (레벨/스탯/HP/위치) ==========
router.post('/characters/:id/modify', async (req: AuthedRequest, res: Response) => {
  const charId = Number(req.params.id);
  const parsed = z.object({
    level: z.number().int().min(1).max(100).optional(),
    gold: z.number().int().optional(),
    exp: z.number().int().min(0).optional(),
    hp: z.number().int().min(0).optional(),
    maxHp: z.number().int().min(1).optional(),
    nodePoints: z.number().int().min(0).optional(),
    location: z.string().optional(),
    stats: z.object({
      str: z.number().int().optional(),
      dex: z.number().int().optional(),
      int: z.number().int().optional(),
      vit: z.number().int().optional(),
      spd: z.number().int().optional(),
      cri: z.number().int().optional(),
    }).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;
  const d = parsed.data;

  if (d.level !== undefined) { updates.push(`level = $${paramIdx++}`); params.push(d.level); }
  if (d.gold !== undefined) { updates.push(`gold = $${paramIdx++}`); params.push(d.gold); }
  if (d.exp !== undefined) { updates.push(`exp = $${paramIdx++}`); params.push(d.exp); }
  if (d.hp !== undefined) { updates.push(`hp = $${paramIdx++}`); params.push(d.hp); }
  if (d.maxHp !== undefined) { updates.push(`max_hp = $${paramIdx++}`); params.push(d.maxHp); }
  if (d.nodePoints !== undefined) { updates.push(`node_points = $${paramIdx++}`); params.push(d.nodePoints); }
  if (d.location !== undefined) { updates.push(`location = $${paramIdx++}`); params.push(d.location); }
  if (d.stats) {
    // 개별 스탯 수정
    for (const [k, v] of Object.entries(d.stats)) {
      if (v !== undefined) {
        updates.push(`stats = jsonb_set(stats, '{${k}}', $${paramIdx++}::text::jsonb)`);
        params.push(v);
      }
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: '수정할 항목이 없습니다.' });

  // 스탯/노드 포인트 오버 방어 — 어드민이 직접 stats/node_points 를 올려 (L-1)×2 / (L-1)
  // 초과를 만드는 케이스 차단. 필요 시 force=true 쿼리로 우회 가능.
  const force = req.query.force === 'true' || req.query.force === '1';
  if (!force && (d.stats || d.nodePoints !== undefined || d.level !== undefined)) {
    const curR = await query<{ class_name: string; level: number; stats: Record<string, number>; node_points: number }>(
      `SELECT class_name, level, stats, node_points FROM characters WHERE id = $1`, [charId]
    );
    const cur = curR.rows[0];
    if (cur) {
      const start = CLASS_START[cur.class_name as ClassName];
      if (start) {
        const newLevel = d.level ?? cur.level;
        const newStats = { ...cur.stats, ...(d.stats || {}) };
        const newNodePoints = d.nodePoints ?? cur.node_points;
        const alloc =
          Math.max(0, (newStats.str ?? start.stats.str) - start.stats.str) +
          Math.max(0, (newStats.dex ?? start.stats.dex) - start.stats.dex) +
          Math.max(0, (newStats.int ?? start.stats.int) - start.stats.int) +
          Math.max(0, (newStats.vit ?? start.stats.vit) - start.stats.vit);
        const expectedStat = Math.max(0, (newLevel - 1) * 2);
        if (alloc > expectedStat) {
          return res.status(400).json({
            error: `스탯 할당 ${alloc} > 레벨 ${newLevel} 기댓값 ${expectedStat}. 강제 진행 필요 시 ?force=true`,
          });
        }
        const spentR = await query<{ total: string }>(
          `SELECT COALESCE(SUM(nd.cost), 0)::text AS total FROM character_nodes cn
             JOIN node_definitions nd ON nd.id = cn.node_id WHERE cn.character_id = $1`, [charId]
        );
        const nodeSpent = Number(spentR.rows[0]?.total || 0);
        const expectedNode = Math.max(0, newLevel - 1);
        if (nodeSpent + newNodePoints > expectedNode) {
          return res.status(400).json({
            error: `노드 총량 ${nodeSpent + newNodePoints} > 기댓값 ${expectedNode}. 강제 진행 필요 시 ?force=true`,
          });
        }
      }
    }
  }

  params.push(charId);
  await query(`UPDATE characters SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
  // 전투 중이면 세션 스탯 즉시 갱신 — 어드민 수정 후 데미지 드랍 버그 방지
  try { const { refreshSessionStats } = await import('../combat/engine.js'); await refreshSessionStats(charId); } catch { /* ignore */ }
  res.json({ ok: true, message: '캐릭터 수정 완료' });
});

// ========== 전투 강제 종료 ==========
router.post('/characters/:id/kick-combat', async (req: AuthedRequest, res: Response) => {
  const charId = Number(req.params.id);
  try {
    await stopCombatSession(charId);
    res.json({ ok: true, message: '전투 세션 종료 완료' });
  } catch {
    res.json({ ok: true, message: '전투 세션이 없거나 이미 종료됨' });
  }
});

// ========== 실시간 킬 통계 (인메모리 세션) ==========
router.get('/characters/:id/kill-stats', async (req: AuthedRequest, res: Response) => {
  const charId = Number(req.params.id);
  if (!Number.isFinite(charId)) return res.status(400).json({ error: 'invalid id' });
  const charRow = await query<{ id: number; name: string; level: number; class_name: string }>(
    'SELECT id, name, level, class_name FROM characters WHERE id = $1', [charId]
  );
  if (charRow.rowCount === 0) return res.status(404).json({ error: 'character not found' });
  const stats = getKillStats(charId);
  res.json({ character: charRow.rows[0], stats });
});

// 이름으로 조회 (편의)
router.get('/characters/by-name/:name/kill-stats', async (req: AuthedRequest, res: Response) => {
  const name = String(req.params.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const charRow = await query<{ id: number; name: string; level: number; class_name: string }>(
    'SELECT id, name, level, class_name FROM characters WHERE name = $1', [name]
  );
  if (charRow.rowCount === 0) return res.status(404).json({ error: 'character not found' });
  const stats = getKillStats(charRow.rows[0].id);
  res.json({ character: charRow.rows[0], stats });
});

// ========== 개인 우편 발송 ==========
router.post('/characters/:id/send-mail', async (req: AuthedRequest, res: Response) => {
  const charId = Number(req.params.id);
  const parsed = z.object({
    subject: z.string().min(1).max(100),
    body: z.string().min(1).max(500),
    gold: z.number().int().min(0).default(0),
    itemId: z.number().int().positive().optional(),
    itemQty: z.number().int().min(1).max(999).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { subject, body, gold, itemId, itemQty } = parsed.data;

  if (itemId && itemQty) {
    await deliverToMailbox(charId, subject, body, itemId, itemQty, gold);
  } else if (gold > 0) {
    await deliverToMailbox(charId, subject, body, 0, 0, gold);
  } else {
    await query(
      'INSERT INTO mailbox (character_id, subject, body) VALUES ($1, $2, $3)',
      [charId, subject, body]
    );
  }
  res.json({ ok: true, message: '우편 발송 완료' });
});

// ========== 캐릭터 인벤토리 초기화 ==========
router.post('/characters/:id/clear-inventory', async (req: AuthedRequest, res: Response) => {
  const charId = Number(req.params.id);
  const r = await query('DELETE FROM character_inventory WHERE character_id = $1', [charId]);
  res.json({ ok: true, message: `${r.rowCount}개 슬롯 삭제 완료` });
});

// ========== 유저 관리 ==========
router.get('/users', async (req, res) => {
  const search = (req.query.search as string) || '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 30;
  const offset = (page - 1) * limit;

  let where = '';
  let params: unknown[] = [limit, offset];
  if (search) {
    where = 'WHERE (u.username ILIKE $3 OR u.id IN (SELECT user_id FROM characters WHERE name ILIKE $3))';
    params.push(`%${search}%`);
  }

  const countR = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM users u ${where}`,
    search ? [`%${search}%`] : []
  );
  const total = Number(countR.rows[0].count);

  const r = await query(
    `SELECT u.id, u.username, u.is_admin, u.banned, u.ban_reason,
            u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM characters WHERE user_id = u.id)::int AS char_count,
            (SELECT MAX(level) FROM characters WHERE user_id = u.id) AS max_level,
            (SELECT string_agg(name || ' (Lv.' || level || ' ' || class_name || ')', ', ' ORDER BY level DESC) FROM characters WHERE user_id = u.id) AS char_names
     FROM users u ${where}
     ORDER BY u.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );
  res.json({ users: r.rows, total, page, totalPages: Math.ceil(total / limit) });
});

// 방치보상 드라이런 — 실제 지급 없이 계산 결과만 반환 (검증용)
// ?characterId=123&fakeHours=12  (fakeHours 옵션: last_online_at 을 임시로 N시간 전으로 계산)
router.get('/offline-simulate', async (req, res) => {
  const characterId = Number(req.query.characterId);
  const fakeHours = req.query.fakeHours ? Number(req.query.fakeHours) : null;
  if (!characterId) return res.status(400).json({ error: 'characterId required' });

  // fakeHours 사용 시 last_online_at 임시 백업→덮어쓰기→복원
  let originalLastOnline: string | null = null;
  if (fakeHours && fakeHours > 0 && fakeHours <= 24) {
    const r = await query<{ last_online_at: string }>('SELECT last_online_at FROM characters WHERE id = $1', [characterId]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'character not found' });
    originalLastOnline = r.rows[0].last_online_at;
    const backDate = new Date(Date.now() - fakeHours * 3600 * 1000).toISOString();
    await query('UPDATE characters SET last_online_at = $1 WHERE id = $2', [backDate, characterId]);
  }

  try {
    const { generateAndApplyOfflineReport } = await import('../offline/calculate.js');
    const report = await generateAndApplyOfflineReport(characterId, { dryRun: true });
    res.json({ ok: true, fakeHours: fakeHours || 'actual', report });
  } finally {
    // 원복
    if (originalLastOnline) {
      await query('UPDATE characters SET last_online_at = $1 WHERE id = $2', [originalLastOnline, characterId]);
    }
  }
});

// 서버 전체 초기화 — 유저 데이터 전부 삭제 (마스터 데이터 보존) + admin 계정 재생성
router.post('/wipe-server', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ confirm: z.literal('WIPE_SERVER_YES_I_AM_SURE') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid confirm token' });

  const USER_DATA_TABLES = [
    'users',
    'characters', 'character_inventory', 'character_equipped', 'character_skills',
    'character_nodes', 'combat_sessions', 'mailbox', 'offline_reports',
    'account_storage_items', 'character_quests', 'character_daily_quests', 'character_achievements',
    'character_equip_presets', 'character_node_presets', 'character_skill_presets',
    'auctions', 'chat_messages',
    'guilds', 'guild_members', 'guild_storage_items', 'guild_storage_logs',
    'guild_wars', 'guild_war_matches', 'guild_boss_daily', 'guild_boss_runs',
    'guild_boss_guild_daily', 'guild_boss_weekly_settlements', 'guild_boss_shop_purchases',
    'parties', 'party_members', 'party_invites',
    'pvp_stats', 'pvp_battles', 'pvp_cooldowns', 'pvp_defense_loadouts',
    'premium_purchases', 'announcement_reads', 'feedback',
    'world_event_active', 'world_event_participants',
    'enhance_log', 'guestbook',
    'blocked_ips', 'global_events', 'user_login_log',
    'board_posts', 'board_comments', 'board_reports',
    'item_drop_log',
  ];

  const truncated: string[] = [];
  const skipped: { table: string; error: string }[] = [];

  // 개별 try-catch: 존재하지 않는 테이블은 스킵
  for (const t of USER_DATA_TABLES) {
    try {
      await query(`TRUNCATE ${t} RESTART IDENTITY CASCADE`);
      truncated.push(t);
    } catch (e: any) {
      skipped.push({ table: t, error: String(e?.message || e).slice(0, 100) });
    }
  }

  // admin 계정 즉시 재생성 (이후 요청을 위해)
  const { default: bcrypt } = await import('bcryptjs');
  const hash = await bcrypt.hash('tlqkfsnr123!', 10);
  await query(
    `INSERT INTO users (username, password_hash, email, is_admin)
     VALUES ('admin', $1, 'admin@internal', TRUE)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_admin = TRUE`,
    [hash]
  );

  // 점검 해제 (관리자만 남은 빈 서버이므로 점검 유지 의미 없음 — 선택)
  // await query(`DELETE FROM server_config WHERE key = 'maintenance_until'`);

  res.json({
    ok: true,
    truncatedCount: truncated.length,
    truncated,
    skippedCount: skipped.length,
    skipped,
    adminRecreated: true,
    adminCredentials: { username: 'admin', note: '기존 비밀번호 tlqkfsnr123! 유지' },
  });
});

// 유지보수 모드 설정/해제 — 어드민 외 접속 차단
// enabled=true 면 현재 접속한 non-admin 전부 강제 종료 + 신규 접속 503/차단
router.post('/maintenance', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    enabled: z.boolean(),
    untilMinutes: z.number().int().min(1).max(24 * 60).default(120),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const { enabled, untilMinutes } = parsed.data;

  if (enabled) {
    const until = new Date(Date.now() + untilMinutes * 60_000).toISOString();
    await query(
      `INSERT INTO server_config (key, value) VALUES ('maintenance_until', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [until]
    );
  } else {
    await query(`DELETE FROM server_config WHERE key = 'maintenance_until'`);
  }

  const { invalidateMaintenanceCache } = await import('../middleware/maintenance.js');
  invalidateMaintenanceCache();

  // 현재 접속한 non-admin 소켓 강제 종료
  let kicked = 0;
  const io = getIo();
  if (enabled && io) {
    for (const [, s] of io.sockets.sockets) {
      if (!s.data.isAdmin) {
        s.emit('server:maintenance', { message: '서버 점검에 들어갑니다. 자동으로 접속이 종료됩니다.' });
        s.disconnect(true);
        kicked += 1;
      }
    }
  }

  res.json({ ok: true, enabled, untilMinutes: enabled ? untilMinutes : 0, kicked });
});

// 전체 로그아웃 — 모든 기존 JWT 무효화
// server_config.min_jwt_iat = 현재 epoch(초) 로 설정하면 이후 auth 미들웨어가
// payload.iat < min_jwt_iat 인 모든 토큰을 거부. user_id 재사용 누수 대응.
router.post('/force-global-logout', async (_req: AuthedRequest, res: Response) => {
  const nowSec = Math.floor(Date.now() / 1000);
  await query(
    `INSERT INTO server_config (key, value, updated_at)
     VALUES ('min_jwt_iat', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [String(nowSec)]
  );
  const { invalidateMinIatCache } = await import('../middleware/auth.js');
  invalidateMinIatCache();

  // 현재 접속한 모든 non-admin 소켓 강제 종료
  let kicked = 0;
  const io = getIo();
  if (io) {
    for (const [, s] of io.sockets.sockets) {
      if (!s.data.isAdmin) {
        s.emit('server:force-logout', { message: '보안 갱신으로 재로그인이 필요합니다.' });
        s.disconnect(true);
        kicked += 1;
      }
    }
  }
  res.json({ ok: true, minJwtIat: nowSec, kicked });
});

// 어드민 권한 부여/회수
router.post('/users/:id/set-admin', async (req: AuthedRequest, res: Response) => {
  const userId = Number(req.params.id);
  const parsed = z.object({ isAdmin: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const r = await query<{ username: string }>('SELECT username FROM users WHERE id = $1', [userId]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'user not found' });
  await query('UPDATE users SET is_admin = $1 WHERE id = $2', [parsed.data.isAdmin, userId]);
  res.json({ ok: true, username: r.rows[0].username, isAdmin: parsed.data.isAdmin });
});

// 필드 진단 — monster_pool + 각 몬스터의 스탯 확인용
router.get('/field-diag/:fieldId', async (req, res) => {
  const fieldId = Number(req.params.fieldId);
  const f = await query<{ id: number; name: string; required_level: number; monster_pool: number[] }>(
    'SELECT id, name, required_level, monster_pool FROM fields WHERE id = $1', [fieldId]
  );
  if (f.rowCount === 0) return res.status(404).json({ error: 'field not found' });
  const pool = f.rows[0].monster_pool || [];
  const m = pool.length > 0 ? await query<{
    id: number; name: string; level: number; max_hp: number;
    exp_reward: number; gold_reward: number;
    stats: Record<string, number>;
    drop_table: unknown;
  }>('SELECT id, name, level, max_hp, exp_reward, gold_reward, stats, drop_table FROM monsters WHERE id = ANY($1::int[])', [pool]) : { rows: [] };
  res.json({ field: f.rows[0], monsters: m.rows });
});

// 캐릭터 버프 (EXP/골드/드랍 boost) 시간 추가 — 일일임무 버프 N시간 부여
router.post('/characters/:id/grant-boost', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    hours: z.number().int().min(1).max(168),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const charId = Number(req.params.id);
  const hours = parsed.data.hours;
  try {
    const r = await query(
      `UPDATE characters SET
         exp_boost_until  = GREATEST(COALESCE(exp_boost_until, NOW()), NOW()) + INTERVAL '${hours} hours',
         gold_boost_until = GREATEST(COALESCE(gold_boost_until, NOW()), NOW()) + INTERVAL '${hours} hours',
         drop_boost_until = GREATEST(COALESCE(drop_boost_until, NOW()), NOW()) + INTERVAL '${hours} hours'
       WHERE id = $1 RETURNING name, exp_boost_until, gold_boost_until, drop_boost_until`,
      [charId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'character not found' });
    invalidateSessionMeta(charId);
    res.json({ ok: true, character: r.rows[0] });
  } catch (e) {
    console.error('[admin] grant-boost err', e);
    res.status(500).json({ error: String(e).slice(0, 200) });
  }
});

// 캐릭터 버프 해제 — NULL 로 초기화
router.post('/characters/:id/clear-boost', async (req: AuthedRequest, res: Response) => {
  const charId = Number(req.params.id);
  try {
    const r = await query(
      `UPDATE characters SET
         exp_boost_until = NULL,
         gold_boost_until = NULL,
         drop_boost_until = NULL
       WHERE id = $1 RETURNING name`,
      [charId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'character not found' });
    invalidateSessionMeta(charId);
    res.json({ ok: true, character: r.rows[0] });
  } catch (e) {
    console.error('[admin] clear-boost err', e);
    res.status(500).json({ error: String(e).slice(0, 200) });
  }
});

// 유저 계정 완전 삭제 (탈퇴 처리) — CASCADE 로 characters·inventory·mailbox 등 전부 삭제
router.post('/users/:id/delete', async (req: AuthedRequest, res: Response) => {
  const userId = Number(req.params.id);
  if (userId === req.userId) return res.status(400).json({ error: '본인 계정은 삭제 불가' });
  const ur = await query<{ username: string; is_admin: boolean }>(
    'SELECT username, is_admin FROM users WHERE id = $1', [userId]
  );
  if (ur.rowCount === 0) return res.status(404).json({ error: 'user not found' });
  if (ur.rows[0].is_admin) return res.status(400).json({ error: '어드민 계정은 set-admin 으로 권한 해제 후 삭제' });

  try {
    // 유저 캐릭터 id 목록
    const charR = await query<{ id: number }>('SELECT id FROM characters WHERE user_id = $1', [userId]);
    const charIds = charR.rows.map(r => r.id);

    if (charIds.length > 0) {
      // CASCADE 없는 FK 참조 테이블 선제 정리 (best-effort)
      const cleanupTables = [
        'item_drop_log', 'enhance_log', 'guestbook', 'feedback',
        'announcement_reads', 'board_posts', 'board_comments', 'board_reports',
        'pvp_battles', 'pvp_cooldowns', 'guild_boss_runs', 'guild_boss_guild_daily',
        'guild_boss_weekly_settlements', 'guild_boss_shop_purchases',
        'world_event_participants', 'premium_purchases',
      ];
      for (const t of cleanupTables) {
        try { await query(`DELETE FROM ${t} WHERE character_id = ANY($1::int[])`, [charIds]); } catch { /* table or column missing */ }
      }
      // auctions: 판매중이면 삭제, 입찰자면 NULL 처리
      try { await query(`DELETE FROM auctions WHERE seller_id = ANY($1::int[])`, [charIds]); } catch { /* ignore */ }
      try { await query(`UPDATE auctions SET current_bidder_id = NULL WHERE current_bidder_id = ANY($1::int[])`, [charIds]); } catch { /* ignore */ }
      // party_invites: from/to 양쪽
      try { await query(`DELETE FROM party_invites WHERE to_id = ANY($1::int[]) OR from_id = ANY($1::int[])`, [charIds]); } catch { /* ignore */ }
      // pvp_battles.winner_id 는 SET NULL
      try { await query(`UPDATE pvp_battles SET winner_id = NULL WHERE winner_id = ANY($1::int[])`, [charIds]); } catch { /* ignore */ }
      // guilds.leader_id — 캐릭터가 길드장이면 해당 길드 자체 삭제 (leader_id 는 NOT NULL)
      try {
        const gr = await query<{ id: number }>(`SELECT id FROM guilds WHERE leader_id = ANY($1::int[])`, [charIds]);
        if (gr.rowCount && gr.rowCount > 0) {
          const gids = gr.rows.map(r => r.id);
          await query(`DELETE FROM guild_members WHERE guild_id = ANY($1::int[])`, [gids]);
          await query(`DELETE FROM guilds WHERE id = ANY($1::int[])`, [gids]);
        }
      } catch { /* ignore */ }
    }
    // user_login_log 등 user_id 참조 테이블
    const userCleanup = ['user_login_log', 'premium_purchases'];
    for (const t of userCleanup) {
      try { await query(`DELETE FROM ${t} WHERE user_id = $1`, [userId]); } catch { /* ignore */ }
    }

    await query('DELETE FROM users WHERE id = $1', [userId]);
    // auth 캐시 정리 — SERIAL 재사용 시 구 created_at 가 남아있으면 오판 가능
    try {
      const { invalidateUserCreatedAtCache } = await import('../middleware/auth.js');
      invalidateUserCreatedAtCache(userId);
    } catch { /* ignore */ }
    res.json({ ok: true, deletedUser: ur.rows[0].username, deletedCharacters: charIds.length });
  } catch (e) {
    console.error('[admin] delete user err', e);
    res.status(500).json({ error: String(e).slice(0, 300) });
  }
});

router.post('/users/:id/ban', async (req, res) => {
  const userId = Number(req.params.id);
  const parsed = z.object({
    banned: z.boolean(),
    reason: z.string().max(200).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  await query(
    'UPDATE users SET banned = $1, ban_reason = $2 WHERE id = $3',
    [parsed.data.banned, parsed.data.reason ?? null, userId]
  );
  res.json({ ok: true });
});

// 유저 IP 차단 + 계정 정지 (한 번에)
router.post('/users/:id/ip-ban', async (req: AuthedRequest, res: Response) => {
  const userId = Number(req.params.id);
  const parsed = z.object({ reason: z.string().max(200).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const reason = parsed.data.reason ?? '버그 악용';

  // 유저 조회 + IP 확보
  const ur = await query<{ username: string; registered_ip: string | null }>(
    'SELECT username, registered_ip FROM users WHERE id = $1', [userId]
  );
  if (ur.rowCount === 0) return res.status(404).json({ error: 'user not found' });
  const { username, registered_ip } = ur.rows[0];

  // 계정 정지
  await query('UPDATE users SET banned = TRUE, ban_reason = $1 WHERE id = $2', [reason, userId]);

  // IP 차단 (있을 때만)
  let blockedIp: string | null = null;
  if (registered_ip && registered_ip !== 'unknown') {
    await query(
      `INSERT INTO blocked_ips (ip, reason, blocked_by) VALUES ($1, $2, $3)
       ON CONFLICT (ip) DO UPDATE SET reason = EXCLUDED.reason`,
      [registered_ip, `${username}: ${reason}`, req.userId]
    );
    blockedIp = registered_ip;
  }

  res.json({ ok: true, bannedUser: username, blockedIp });
});

// IP 차단 목록 조회
router.get('/blocked-ips', async (_req, res) => {
  const r = await query(
    `SELECT b.ip, b.reason, b.created_at, u.username AS blocked_by_user
     FROM blocked_ips b LEFT JOIN users u ON u.id = b.blocked_by
     ORDER BY b.created_at DESC LIMIT 200`
  );
  res.json(r.rows);
});

// 다계정 IP 자동 차단 — N계정 이상 공유 IP 일괄 차단
// ?threshold=5&execute=1 : 실제 차단 실행, 그외 dry-run (목록만 반환)
router.post('/block-multi-account-ips', async (req: AuthedRequest, res: Response) => {
  const threshold = Math.max(2, Number(req.query.threshold || 5));
  const execute = req.query.execute === '1' || req.query.execute === 'true';

  // registered_ip + user_login_log 전체 IP 합쳐서 계정 수 집계
  // 관리자 계정은 완전 제외
  const r = await query<{ ip: string; user_count: string; user_ids: string[] }>(
    `WITH all_ips AS (
       SELECT u.registered_ip AS ip, u.id AS user_id
         FROM users u
         WHERE u.is_admin = FALSE AND u.registered_ip IS NOT NULL AND u.registered_ip <> ''
       UNION
       SELECT l.ip, l.user_id
         FROM user_login_log l JOIN users u ON u.id = l.user_id
         WHERE u.is_admin = FALSE AND l.ip IS NOT NULL AND l.ip <> ''
     )
     SELECT ip, COUNT(DISTINCT user_id)::text AS user_count,
            ARRAY_AGG(DISTINCT user_id::text) AS user_ids
     FROM all_ips
     WHERE ip <> 'unknown'
     GROUP BY ip
     HAVING COUNT(DISTINCT user_id) >= $1
     ORDER BY COUNT(DISTINCT user_id) DESC`,
    [threshold]
  );

  const candidates = r.rows.map(row => ({
    ip: row.ip,
    userCount: Number(row.user_count),
    userIds: row.user_ids.map(Number),
  }));

  if (!execute) {
    return res.json({ threshold, dryRun: true, candidates: candidates.slice(0, 200), totalCandidates: candidates.length });
  }

  // 실제 차단
  let blocked = 0;
  for (const c of candidates) {
    try {
      const result = await query(
        `INSERT INTO blocked_ips (ip, reason, blocked_by) VALUES ($1, $2, $3)
         ON CONFLICT (ip) DO NOTHING`,
        [c.ip, `다계정 자동차단: ${c.userCount}개 계정 공유 (임계치 ${threshold})`, req.userId]
      );
      if (result.rowCount && result.rowCount > 0) blocked += 1;
    } catch (e) { console.error('[block-multi] err', c.ip, e); }
  }

  res.json({ ok: true, threshold, executed: true, totalCandidates: candidates.length, newlyBlocked: blocked });
});

// IP 차단 해제
router.post('/blocked-ips/unblock', async (req, res) => {
  const parsed = z.object({ ip: z.string().min(1).max(64) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const r = await query('DELETE FROM blocked_ips WHERE ip = $1', [parsed.data.ip]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'ip not in block list' });
  res.json({ ok: true });
});

// ========== 유저 감사: 전체 스캔 (빠른 버전) ==========
router.get('/audit/all', async (_req, res) => {
  // 캐릭터 컬럼만으로 빠른 스캔 (장비/강화 join 없음)
  const r = await query<{
    id: number; user_id: number; username: string; name: string; class_name: string;
    level: number; gold: string; total_kills: string | null; total_gold_earned: string | null;
    created_at: string; banned: boolean; registered_ip: string | null;
  }>(
    `SELECT c.id, c.user_id, u.username, c.name, c.class_name, c.level, c.gold,
            c.total_kills, c.total_gold_earned, c.created_at, u.banned, u.registered_ip
     FROM characters c JOIN users u ON u.id = c.user_id
     WHERE u.is_admin = FALSE`
  );

  const items = r.rows.map(row => {
    const level = row.level;
    const totalKills = Number(row.total_kills || 0);
    const totalGoldEarned = Number(row.total_gold_earned || 0);
    const currentGold = Number(row.gold);
    const ageDays = (Date.now() - new Date(row.created_at).getTime()) / 86400000;
    const expectedKills = Math.max(1, level * 30);

    const flags: { severity: 'low' | 'med' | 'high'; label: string }[] = [];
    if (level >= 30 && totalKills < expectedKills * 0.3) {
      flags.push({ severity: 'high', label: 'EXP 핵 의심' });
    }
    if (currentGold > totalGoldEarned * 1.5 && totalGoldEarned > 0) {
      flags.push({ severity: 'high', label: '골드 핵 의심' });
    }
    if (level >= 20 && ageDays < 0.5) {
      flags.push({ severity: 'high', label: '비정상 빠른 레벨업' });
    }
    if (currentGold >= 10_000_000 && level < 30) {
      flags.push({ severity: 'high', label: '저레벨 거액' });
    }
    const score = flags.reduce((sum, f) => sum + (f.severity === 'high' ? 3 : f.severity === 'med' ? 2 : 1), 0);

    return {
      characterId: row.id,
      userId: row.user_id,
      username: row.username,
      characterName: row.name,
      className: row.class_name,
      level,
      currentGold,
      totalKills,
      totalGoldEarned,
      ageDays: Math.round(ageDays * 10) / 10,
      banned: row.banned,
      registeredIp: row.registered_ip,
      flags,
      suspicionScore: score,
    };
  });

  // 점수 내림차순 정렬, 점수 0인 건 제외
  const ranked = items.filter(i => i.suspicionScore > 0).sort((a, b) => b.suspicionScore - a.suspicionScore);
  res.json({ total: items.length, suspicious: ranked.length, ranked: ranked.slice(0, 100) });
});

// ========== 유저 감사 (의심 지표 계산) ==========
router.get('/audit/character/:id', async (req, res) => {
  const cid = Number(req.params.id);
  if (!cid) return res.status(400).json({ error: 'invalid id' });

  const cr = await query<{
    id: number; user_id: number; username: string; name: string; class_name: string;
    level: number; exp: string; gold: string; max_hp: number; hp: number;
    total_kills: string | null; total_gold_earned: string | null;
    created_at: string; last_online_at: string | null;
    registered_ip: string | null; banned: boolean;
  }>(
    `SELECT c.id, c.user_id, u.username, c.name, c.class_name, c.level, c.exp, c.gold,
            c.max_hp, c.hp, c.total_kills, c.total_gold_earned, c.created_at, c.last_online_at,
            u.registered_ip, u.banned
     FROM characters c JOIN users u ON u.id = c.user_id
     WHERE c.id = $1`, [cid]
  );
  if (cr.rowCount === 0) return res.status(404).json({ error: 'character not found' });
  const c = cr.rows[0];

  // 인벤토리 + 장착 통계
  const invR = await query<{ legendary: string; epic: string; rare: string; total: string; max_enh: number | null }>(
    `SELECT
       COUNT(*) FILTER (WHERE i.grade = 'legendary')::text AS legendary,
       COUNT(*) FILTER (WHERE i.grade = 'epic')::text AS epic,
       COUNT(*) FILTER (WHERE i.grade = 'rare')::text AS rare,
       COUNT(*)::text AS total,
       MAX(GREATEST(COALESCE(ci.enhance_level, 0), 0)) AS max_enh
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1`, [cid]
  );
  const eqR = await query<{ legendary: string; epic: string; max_enh: number | null }>(
    `SELECT
       COUNT(*) FILTER (WHERE i.grade = 'legendary')::text AS legendary,
       COUNT(*) FILTER (WHERE i.grade = 'epic')::text AS epic,
       MAX(GREATEST(COALESCE(ce.enhance_level, 0), 0)) AS max_enh
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id
     WHERE ce.character_id = $1`, [cid]
  );

  // 강화 로그 (10강 이상)
  const enhR = await query<{ total: string; success: string; destroyed: string }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE success = TRUE)::text AS success,
       COUNT(*) FILTER (WHERE destroyed = TRUE)::text AS destroyed
     FROM enhance_log WHERE character_id = $1`, [cid]
  );

  // 거래소 활동
  const aucR = await query<{ listed: string; bought: string }>(
    `SELECT
       (SELECT COUNT(*)::text FROM auctions WHERE seller_id = $1) AS listed,
       (SELECT COUNT(*)::text FROM auctions WHERE settled = TRUE AND seller_id != $1
          AND id IN (SELECT id FROM auctions WHERE seller_id != $1)) AS bought`,
    [cid]
  );

  // 의심 지표 계산
  const level = c.level;
  const totalKills = Number(c.total_kills || 0);
  const totalGoldEarned = Number(c.total_gold_earned || 0);
  const currentGold = Number(c.gold);
  const exp = Number(c.exp);
  const ageDays = (Date.now() - new Date(c.created_at).getTime()) / 86400000;
  const expectedKillsForLevel = Math.max(1, level * 30); // 대략 레벨당 30킬 추정

  const flags: { severity: 'low' | 'med' | 'high'; label: string; detail: string }[] = [];

  if (level >= 30 && totalKills < expectedKillsForLevel * 0.3) {
    flags.push({
      severity: 'high', label: 'EXP 비정상 획득 의심',
      detail: `Lv.${level}인데 처치 ${totalKills.toLocaleString()} (예상 ${expectedKillsForLevel.toLocaleString()}+)`,
    });
  }
  if (currentGold > totalGoldEarned * 1.5 && totalGoldEarned > 0) {
    flags.push({
      severity: 'high', label: '골드 비정상 획득 의심',
      detail: `현재 ${currentGold.toLocaleString()}G > 누적 획득 ${totalGoldEarned.toLocaleString()}G의 1.5배`,
    });
  }
  if (level >= 20 && ageDays < 0.5) {
    flags.push({
      severity: 'high', label: '비정상 빠른 레벨업',
      detail: `가입 ${ageDays.toFixed(1)}일 만에 Lv.${level}`,
    });
  }
  const eqLeg = Number(eqR.rows[0]?.legendary || 0);
  const invLeg = Number(invR.rows[0]?.legendary || 0);
  if ((eqLeg + invLeg) >= 5 && level < 50) {
    flags.push({
      severity: 'med', label: '레전더리 다수 보유',
      detail: `장착+인벤 레전더리 ${eqLeg + invLeg}개 (Lv.${level})`,
    });
  }
  const enhTotal = Number(enhR.rows[0]?.total || 0);
  const enhSuccess = Number(enhR.rows[0]?.success || 0);
  if (enhTotal >= 20 && enhSuccess / enhTotal > 0.7) {
    flags.push({
      severity: 'med', label: '비정상 강화 성공률',
      detail: `${enhTotal}회 시도 중 ${enhSuccess}회 성공 (${Math.round(enhSuccess / enhTotal * 100)}%)`,
    });
  }
  const maxEnh = Math.max(invR.rows[0]?.max_enh || 0, eqR.rows[0]?.max_enh || 0);
  if (maxEnh >= 18 && level < 50) {
    flags.push({
      severity: 'med', label: '저레벨 고강화',
      detail: `최고 강화 +${maxEnh} (Lv.${level})`,
    });
  }
  if (currentGold >= 10_000_000 && level < 30) {
    flags.push({
      severity: 'high', label: '저레벨 거액 보유',
      detail: `${currentGold.toLocaleString()}G (Lv.${level})`,
    });
  }

  res.json({
    character: {
      id: c.id, userId: c.user_id, username: c.username, name: c.name,
      className: c.class_name, level, exp, currentGold,
      totalKills, totalGoldEarned,
      maxHp: c.max_hp, hp: c.hp,
      createdAt: c.created_at, lastOnlineAt: c.last_online_at, ageDays: Math.round(ageDays * 10) / 10,
      registeredIp: c.registered_ip, banned: c.banned,
    },
    inventory: {
      total: Number(invR.rows[0]?.total || 0),
      legendary: invLeg,
      epic: Number(invR.rows[0]?.epic || 0),
      rare: Number(invR.rows[0]?.rare || 0),
      maxEnh: invR.rows[0]?.max_enh || 0,
    },
    equipped: {
      legendary: eqLeg,
      epic: Number(eqR.rows[0]?.epic || 0),
      maxEnh: eqR.rows[0]?.max_enh || 0,
    },
    enhance: {
      total: enhTotal,
      success: enhSuccess,
      destroyed: Number(enhR.rows[0]?.destroyed || 0),
      successRate: enhTotal > 0 ? Math.round(enhSuccess / enhTotal * 100) : 0,
    },
    auctions: {
      listed: Number(aucR.rows[0]?.listed || 0),
    },
    flags,
    suspicionScore: flags.reduce((sum, f) => sum + (f.severity === 'high' ? 3 : f.severity === 'med' ? 2 : 1), 0),
  });
});

// 어드민 비번 재설정
router.post('/users/:id/reset-password', async (req, res) => {
  const userId = Number(req.params.id);
  const parsed = z.object({
    newPassword: z.string().min(4).max(100),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const bcrypt = (await import('bcryptjs')).default;
  const hash = await bcrypt.hash(parsed.data.newPassword, 10);
  const r = await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'user not found' });
  res.json({ ok: true });
});

// ========== 캐릭터 검색/상세 ==========
router.get('/characters/search', async (req, res) => {
  const search = (req.query.name as string) || '';
  if (!search) return res.json({ characters: [] });
  const r = await query(
    `SELECT c.id, c.name, c.class_name, c.level, c.exp, c.gold, c.hp, c.max_hp,
            c.stats, c.location, c.last_online_at, c.created_at, c.node_points,
            u.username, u.id AS user_id
     FROM characters c JOIN users u ON u.id = c.user_id
     WHERE c.name ILIKE $1
     ORDER BY c.level DESC LIMIT 20`,
    [`%${search}%`]
  );
  res.json({ characters: r.rows });
});

router.get('/characters/:id/detail', async (req, res) => {
  const charId = Number(req.params.id);
  const charR = await query(
    `SELECT c.*, u.username FROM characters c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
    [charId]
  );
  if (charR.rowCount === 0) return res.status(404).json({ error: 'not found' });

  const equippedR = await query(
    `SELECT ce.slot, ce.item_id, ce.enhance_level, ce.prefix_stats, ce.locked,
            i.name, i.grade, i.type, i.stats
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id WHERE ce.character_id = $1`,
    [charId]
  );
  const invR = await query(
    `SELECT ci.slot_index, ci.item_id, ci.quantity, ci.enhance_level, ci.prefix_stats, ci.locked,
            i.name, i.grade, i.type, i.slot, i.stats, i.description
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 ORDER BY ci.slot_index`,
    [charId]
  );
  const skillsR = await query(
    `SELECT s.name, s.required_level, cs.auto_use
     FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
     WHERE cs.character_id = $1 ORDER BY s.required_level`,
    [charId]
  );
  const guildR = await query(
    `SELECT g.name AS guild_name, gm.role
     FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id WHERE gm.character_id = $1`,
    [charId]
  );
  // 전투 상태
  const combatR = await query<{ field_id: number }>(
    'SELECT field_id FROM combat_sessions WHERE character_id = $1', [charId]
  );

  res.json({
    character: charR.rows[0],
    equipped: equippedR.rows,
    inventory: invR.rows,
    skills: skillsR.rows,
    guild: guildR.rows[0] ?? null,
    inCombat: (combatR.rowCount ?? 0) > 0,
  });
});

// ========== 아이템 검색 ==========
router.get('/items/search', async (req, res) => {
  const search = (req.query.name as string) || '';
  if (!search) return res.json({ items: [] });
  const r = await query(
    `SELECT id, name, type, grade, slot, stats, description
     FROM items WHERE name ILIKE $1 ORDER BY id LIMIT 30`,
    [`%${search}%`]
  );
  res.json({ items: r.rows });
});

// ========== 아이템 지급+ (전체 목록 + 접두사 + 직접 지급) ==========
router.get('/items/all', async (_req, res) => {
  const r = await query(
    `SELECT id, name, type, grade, slot, required_level, stats, unique_prefix_stats, description, stack_size
     FROM items ORDER BY required_level ASC, id ASC`
  );
  res.json({ items: r.rows });
});

router.get('/prefixes/all', async (_req, res) => {
  const r = await query(
    `SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes ORDER BY stat_key, tier`
  );
  res.json({ prefixes: r.rows });
});

router.post('/grant-item-pro', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    itemId: z.number().int().positive(),
    enhanceLevel: z.number().int().min(0).max(15).default(0),
    quality: z.number().int().min(0).max(100).default(0),
    prefixes: z.array(z.object({
      id: z.number().int().positive(),
      value: z.number().int(),
    })).max(3).default([]),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, itemId, enhanceLevel, quality, prefixes } = parsed.data;

  const charR = await query<{ name: string }>('SELECT name FROM characters WHERE id = $1', [characterId]);
  if (charR.rowCount === 0) return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });

  const itemR = await query<{ name: string; slot: string | null; grade: string; stack_size: number; unique_prefix_stats: Record<string, number> | null }>(
    'SELECT name, slot, grade, stack_size, unique_prefix_stats FROM items WHERE id = $1',
    [itemId]
  );
  if (itemR.rowCount === 0) return res.status(404).json({ error: '아이템을 찾을 수 없습니다.' });
  const item = itemR.rows[0];
  const isEquipment = !!item.slot;
  const isUnique = item.grade === 'unique';

  // 접두사 stat_key 조회 → prefix_stats 빌드
  let prefixIds: number[] = [];
  let prefixStats: Record<string, number> = {};
  if (prefixes.length > 0 && isEquipment) {
    const ids = prefixes.map(p => p.id);
    const pr = await query<{ id: number; stat_key: string }>(
      'SELECT id, stat_key FROM item_prefixes WHERE id = ANY($1)', [ids]
    );
    const keyMap = new Map(pr.rows.map(r => [r.id, r.stat_key]));
    for (const p of prefixes) {
      const key = keyMap.get(p.id);
      if (!key) continue;
      prefixIds.push(p.id);
      prefixStats[key] = (prefixStats[key] || 0) + p.value;
    }
  }
  // 유니크 고정 옵션 합산
  if (isEquipment && isUnique && item.unique_prefix_stats) {
    for (const [k, v] of Object.entries(item.unique_prefix_stats)) {
      prefixStats[k] = (prefixStats[k] || 0) + (v as number);
    }
  }

  // 빈 슬롯 찾기 (장비/소비 공통: 새 슬롯에 직접 INSERT)
  const baseSlots = 300;
  const bonusR = await query<{ bonus: number }>('SELECT inventory_slots_bonus AS bonus FROM characters WHERE id = $1', [characterId]);
  const maxSlots = baseSlots + (bonusR.rows[0]?.bonus || 0);
  const usedR = await query<{ slot_index: number }>('SELECT slot_index FROM character_inventory WHERE character_id = $1', [characterId]);
  const used = new Set(usedR.rows.map(r => r.slot_index));
  let freeSlot = -1;
  for (let i = 0; i < maxSlots; i++) {
    if (!used.has(i)) { freeSlot = i; break; }
  }

  if (freeSlot < 0) {
    // 우편 발송 (접두사/강화/품질 보존)
    await deliverToMailbox(
      characterId,
      '관리자 아이템 지급+',
      '가방이 가득 차서 우편으로 배송되었습니다.',
      itemId,
      1,
      0,
      isEquipment ? {
        enhanceLevel,
        prefixIds: prefixIds.length > 0 ? prefixIds : null,
        prefixStats,
        quality,
      } : undefined
    );
    return res.json({ ok: true, mailed: true, message: `${charR.rows[0].name}: 우편 발송` });
  }

  await query(
    `INSERT INTO character_inventory
     (character_id, item_id, slot_index, quantity, enhance_level, prefix_ids, prefix_stats, quality)
     VALUES ($1, $2, $3, 1, $4, $5, $6::jsonb, $7)`,
    [characterId, itemId, freeSlot, enhanceLevel, prefixIds, JSON.stringify(prefixStats), quality]
  );

  res.json({ ok: true, slotIndex: freeSlot, mailed: false, message: `${charR.rows[0].name}: ${item.name} 지급 완료` });
});

router.post('/grant-item', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    itemId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(999).default(1),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, itemId, quantity } = parsed.data;

  const charR = await query<{ name: string }>('SELECT name FROM characters WHERE id = $1', [characterId]);
  if (charR.rowCount === 0) return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });

  const { added, overflow } = await addItemToInventory(characterId, itemId, quantity);
  if (overflow > 0) {
    await deliverToMailbox(characterId, '관리자 아이템 지급', '가방이 가득 차서 우편으로 배송되었습니다.', itemId, overflow);
  }
  res.json({ ok: true, added, overflow, message: overflow > 0 ? `${added}개 지급, ${overflow}개 우편 전송` : `${added}개 지급 완료` });
});

router.post('/revoke-item', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    slotIndex: z.number().int().min(0),
    quantity: z.number().int().min(1).max(999).default(1),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, slotIndex, quantity } = parsed.data;

  const slotR = await query<{ quantity: number }>(
    'SELECT quantity FROM character_inventory WHERE character_id = $1 AND slot_index = $2',
    [characterId, slotIndex]
  );
  if (slotR.rowCount === 0) return res.status(404).json({ error: '해당 슬롯에 아이템이 없습니다.' });

  const current = slotR.rows[0].quantity;
  if (quantity >= current) {
    await query('DELETE FROM character_inventory WHERE character_id = $1 AND slot_index = $2', [characterId, slotIndex]);
  } else {
    await query('UPDATE character_inventory SET quantity = quantity - $1 WHERE character_id = $2 AND slot_index = $3', [quantity, characterId, slotIndex]);
  }
  res.json({ ok: true, removed: Math.min(quantity, current) });
});

// ========== 전체 보상 ==========
router.post('/grant-all', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    gold: z.number().int().min(0).default(0),
    exp: z.number().int().min(0).default(0),
    reason: z.string().max(200).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { gold, exp, reason } = parsed.data;
  if (!gold && !exp) return res.status(400).json({ error: '골드 또는 경험치를 입력하세요.' });

  let affected = 0;
  if (gold) { const r = await query('UPDATE characters SET gold = gold + $1', [gold]); affected = r.rowCount ?? 0; }
  if (exp) { const r = await query('UPDATE characters SET exp = exp + $1', [exp]); affected = Math.max(affected, r.rowCount ?? 0); }

  const chars = await query<{ id: number }>('SELECT id FROM characters');
  const subject = '운영자 보상 지급';
  const body = `${reason || '전체 보상 지급'}\n${gold ? `골드: +${gold.toLocaleString()}G` : ''}${exp ? `\n경험치: +${exp.toLocaleString()}` : ''}`;
  for (const c of chars.rows) {
    await query('INSERT INTO mailbox (character_id, subject, body) VALUES ($1, $2, $3)', [c.id, subject, body]);
  }
  res.json({ ok: true, affected, message: `${affected}명에게 지급 완료` });
});

// ========== 월드 이벤트 ==========
router.get('/world-event/status', async (_req, res) => {
  const event = await getActiveEvent();
  const bosses = await query<{ id: number; name: string; level: number; max_hp: number }>(
    'SELECT id, name, level, max_hp FROM world_event_bosses ORDER BY id'
  );
  res.json({ activeEvent: event, bosses: bosses.rows });
});

router.post('/world-event/spawn', async (req, res) => {
  const existing = await getActiveEvent();
  if (existing) return res.status(400).json({ error: '이미 진행 중인 이벤트가 있습니다.' });
  const parsed = z.object({
    bossId: z.number().int().positive(),
    durationMin: z.number().int().min(1).max(120).default(30),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const { bossId, durationMin } = parsed.data;
  const bossR = await query<{ name: string; max_hp: number }>('SELECT name, max_hp FROM world_event_bosses WHERE id = $1', [bossId]);
  if (bossR.rowCount === 0) return res.status(404).json({ error: '보스를 찾을 수 없습니다.' });
  const boss = bossR.rows[0];

  await query(
    `INSERT INTO world_event_active (boss_id, current_hp, max_hp, ends_at)
     VALUES ($1, $2, $2, NOW() + INTERVAL '1 minute' * $3)`,
    [bossId, boss.max_hp, durationMin]
  );
  const io = getIo();
  if (io) io.emit('world_event', { type: 'world_event_start', bossName: boss.name, endsAt: new Date(Date.now() + durationMin * 60000).toISOString() });
  res.json({ ok: true, message: `${boss.name} 소환 완료 (${durationMin}분)` });
});

router.post('/world-event/end', async (_req, res) => {
  const event = await getActiveEvent();
  if (!event) return res.status(400).json({ error: '진행 중인 이벤트가 없습니다.' });
  const io = getIo();
  await finishEvent(event.id, 'expired', io ?? undefined);
  res.json({ ok: true, message: '이벤트 강제 종료 완료' });
});

// ========== 시스템 공지 ==========
router.post('/system-message', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    text: z.string().min(1).max(500),
    channel: z.enum(['global', 'trade']).default('global'),
    durationMs: z.number().int().positive().max(3600000).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { text, channel, durationMs } = parsed.data;

  const r = await query<{ id: number; created_at: string }>(
    `INSERT INTO chat_messages (channel, from_name, text, scope_id) VALUES ($1, $2, $3, NULL) RETURNING id, created_at`,
    [channel, '[시스템]', text]
  );
  const io = getIo();
  if (io) {
    io.emit('chat', { id: r.rows[0].id, channel, scopeId: null, from: '[시스템]', text, isAdmin: true, createdAt: r.rows[0].created_at });
    io.emit('system-broadcast', { text, durationMs, createdAt: r.rows[0].created_at });
  }
  res.json({ ok: true });
});

// 신규 캐릭 EXP 이벤트 관리
router.get('/new-char-event', async (_req, res) => {
  const r = await query<{ key: string; value: string }>(
    "SELECT key, value FROM server_settings WHERE key IN ('new_char_exp_pct','new_char_exp_until')"
  );
  const m: Record<string, string> = {};
  for (const row of r.rows) m[row.key] = row.value;
  const pct = Number(m['new_char_exp_pct'] || 0);
  const untilStr = m['new_char_exp_until'] || '';
  const until = untilStr ? new Date(untilStr) : null;
  const active = pct > 0 && !!until && until.getTime() > Date.now();
  res.json({ pct, until: untilStr, active });
});

router.post('/new-char-event', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    pct: z.number().int().min(0).max(10000),
    hours: z.number().int().min(0).max(720),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'pct(0~10000), hours(0~720) 필수' });
  const { pct, hours } = parsed.data;

  if (pct <= 0 || hours <= 0) {
    await query("UPDATE server_settings SET value='0', updated_at=NOW() WHERE key='new_char_exp_pct'");
    await query("UPDATE server_settings SET value='', updated_at=NOW() WHERE key='new_char_exp_until'");
    return res.json({ ok: true, cleared: true });
  }
  const until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  await query("UPDATE server_settings SET value=$1, updated_at=NOW() WHERE key='new_char_exp_pct'", [String(pct)]);
  await query("UPDATE server_settings SET value=$1, updated_at=NOW() WHERE key='new_char_exp_until'", [until]);
  res.json({ ok: true, pct, until, hours });
});

export default router;
