import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { adminRequired } from '../middleware/admin.js';
import { addItemToInventory, deliverToMailbox } from '../game/inventory.js';
import { getIo } from '../ws/io.js';
import { getActiveEvent, finishEvent } from '../game/worldEvent.js';
import { stopCombatSession } from '../combat/engine.js';

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

  params.push(charId);
  await query(`UPDATE characters SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
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

export default router;
