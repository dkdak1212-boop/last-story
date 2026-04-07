import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { adminRequired } from '../middleware/admin.js';
import { addItemToInventory } from '../game/inventory.js';
import { getIo } from '../ws/io.js';
import { getActiveEvent, finishEvent } from '../game/worldEvent.js';

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
  res.json({
    totalUsers: Number(users.rows[0].count),
    totalCharacters: Number(chars.rows[0].count),
    active24h: Number(active24h.rows[0].count),
    totalGuilds: Number(guilds.rows[0].count),
    openAuctions: Number(auctions.rows[0].count),
    openFeedback: Number(openFeedback.rows[0].count),
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
  const id = Number(req.params.id);
  await query('UPDATE announcements SET active = NOT active WHERE id = $1', [id]);
  res.json({ ok: true });
});

router.post('/announcements/:id/delete', async (req, res) => {
  const id = Number(req.params.id);
  await query('DELETE FROM announcements WHERE id = $1', [id]);
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

// ========== 지원 도구: 골드/경험치 부여 ==========
router.post('/grant', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    gold: z.number().int().optional(),
    exp: z.number().int().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, gold, exp } = parsed.data;
  if (gold) await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [gold, characterId]);
  if (exp) await query('UPDATE characters SET exp = exp + $1 WHERE id = $2', [exp, characterId]);
  res.json({ ok: true });
});

// ========== 1. 유저 목록 조회 + 검색 + 밴 ==========
router.get('/users', async (req, res) => {
  const search = (req.query.search as string) || '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 30;
  const offset = (page - 1) * limit;

  let where = '';
  let params: unknown[] = [limit, offset];
  if (search) {
    // 유저명 또는 캐릭터명으로 검색
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

// ========== 2. 캐릭터 상세 조회 ==========
router.get('/characters/search', async (req, res) => {
  const search = (req.query.name as string) || '';
  if (!search) return res.json({ characters: [] });

  const r = await query(
    `SELECT c.id, c.name, c.class_name, c.level, c.exp, c.gold, c.hp, c.mp, c.max_hp, c.max_mp,
            c.stats, c.location, c.last_online_at, c.created_at,
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

  // 기본 정보
  const charR = await query(
    `SELECT c.*, u.username FROM characters c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
    [charId]
  );
  if (charR.rowCount === 0) return res.status(404).json({ error: 'not found' });
  const char = charR.rows[0];

  // 장착 장비
  const equippedR = await query(
    `SELECT ce.slot, ce.item_id, ce.enhance_level, ce.prefix_stats, ce.locked,
            i.name, i.grade, i.type, i.stats
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id
     WHERE ce.character_id = $1`,
    [charId]
  );

  // 인벤토리
  const invR = await query(
    `SELECT ci.slot_index, ci.item_id, ci.quantity, ci.enhance_level, ci.prefix_stats, ci.locked,
            i.name, i.grade, i.type, i.slot, i.stats, i.description
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1
     ORDER BY ci.slot_index`,
    [charId]
  );

  // 스킬
  const skillsR = await query(
    `SELECT s.name, s.required_level, cs.auto_use
     FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
     WHERE cs.character_id = $1 ORDER BY s.required_level`,
    [charId]
  );

  // 길드
  const guildR = await query(
    `SELECT g.name AS guild_name, gm.role
     FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id
     WHERE gm.character_id = $1`,
    [charId]
  );

  res.json({
    character: char,
    equipped: equippedR.rows,
    inventory: invR.rows,
    skills: skillsR.rows,
    guild: guildR.rows[0] ?? null,
  });
});

// ========== 4. 아이템 지급 ==========
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
    quantity: z.number().int().min(1).max(99).default(1),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, itemId, quantity } = parsed.data;

  const charR = await query<{ name: string }>('SELECT name FROM characters WHERE id = $1', [characterId]);
  if (charR.rowCount === 0) return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });

  const { added, overflow } = await addItemToInventory(characterId, itemId, quantity);
  res.json({ ok: true, added, overflow, message: overflow > 0 ? `${added}개 지급, ${overflow}개는 가방이 가득 차 미지급` : `${added}개 지급 완료` });
});

// ========== 5. 아이템 회수 ==========
router.post('/revoke-item', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    characterId: z.number().int().positive(),
    slotIndex: z.number().int().min(0),
    quantity: z.number().int().min(1).max(99).default(1),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { characterId, slotIndex, quantity } = parsed.data;

  const slotR = await query<{ quantity: number; item_id: number }>(
    'SELECT quantity, item_id FROM character_inventory WHERE character_id = $1 AND slot_index = $2',
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

// ========== 7. 전체 골드/경험치 일괄 지급 ==========
router.post('/grant-all', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    gold: z.number().int().min(0).default(0),
    exp: z.number().int().min(0).default(0),
    reason: z.string().max(200).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { gold, exp, reason } = parsed.data;
  if (!gold && !exp) return res.status(400).json({ error: '골드 또는 경험치를 입력하세요.' });

  // 모든 캐릭터에 지급
  let affected = 0;
  if (gold) {
    const r = await query('UPDATE characters SET gold = gold + $1', [gold]);
    affected = r.rowCount ?? 0;
  }
  if (exp) {
    const r = await query('UPDATE characters SET exp = exp + $1', [exp]);
    affected = Math.max(affected, r.rowCount ?? 0);
  }

  // 우편으로 알림
  const chars = await query<{ id: number }>('SELECT id FROM characters');
  const subject = '운영자 보상 지급';
  const body = `${reason || '전체 보상 지급'}\n${gold ? `골드: +${gold.toLocaleString()}G` : ''}${exp ? `\n경험치: +${exp.toLocaleString()}` : ''}`;
  for (const c of chars.rows) {
    await query(
      'INSERT INTO mailbox (character_id, subject, body) VALUES ($1, $2, $3)',
      [c.id, subject, body]
    );
  }

  res.json({ ok: true, affected, message: `${affected}명에게 지급 완료` });
});

// ========== 8. 월드 이벤트 수동 실행/종료 ==========
router.get('/world-event/status', async (_req, res) => {
  const event = await getActiveEvent();
  const bosses = await query<{ id: number; name: string; level: number; max_hp: number }>(
    'SELECT id, name, level, max_hp FROM world_event_bosses ORDER BY id'
  );
  res.json({ activeEvent: event, bosses: bosses.rows });
});

router.post('/world-event/spawn', async (req, res) => {
  // 이미 활성 이벤트 확인
  const existing = await getActiveEvent();
  if (existing) return res.status(400).json({ error: '이미 진행 중인 이벤트가 있습니다.' });

  const parsed = z.object({
    bossId: z.number().int().positive(),
    durationMin: z.number().int().min(1).max(120).default(30),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const { bossId, durationMin } = parsed.data;
  const bossR = await query<{ name: string; max_hp: number }>(
    'SELECT name, max_hp FROM world_event_bosses WHERE id = $1', [bossId]
  );
  if (bossR.rowCount === 0) return res.status(404).json({ error: '보스를 찾을 수 없습니다.' });
  const boss = bossR.rows[0];

  await query(
    `INSERT INTO world_event_active (boss_id, current_hp, max_hp, ends_at)
     VALUES ($1, $2, $2, NOW() + INTERVAL '1 minute' * $3)`,
    [bossId, boss.max_hp, durationMin]
  );

  const io = getIo();
  if (io) {
    const endsAt = new Date(Date.now() + durationMin * 60000).toISOString();
    io.emit('world_event', { type: 'world_event_start', bossName: boss.name, endsAt });
  }

  res.json({ ok: true, message: `${boss.name} 소환 완료 (${durationMin}분)` });
});

router.post('/world-event/end', async (_req, res) => {
  const event = await getActiveEvent();
  if (!event) return res.status(400).json({ error: '진행 중인 이벤트가 없습니다.' });

  const io = getIo();
  await finishEvent(event.id, 'expired', io ?? undefined);
  res.json({ ok: true, message: '이벤트 강제 종료 완료' });
});

// ========== 9. 서버 공지 (실시간 채팅) ==========
router.post('/system-message', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    text: z.string().min(1).max(500),
    channel: z.enum(['global', 'trade']).default('global'),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const { text, channel } = parsed.data;

  // DB에 저장
  const r = await query<{ id: number; created_at: string }>(
    `INSERT INTO chat_messages (channel, from_name, text, scope_id)
     VALUES ($1, $2, $3, NULL) RETURNING id, created_at`,
    [channel, '[시스템]', text]
  );

  // 소켓으로 실시간 전송
  const io = getIo();
  if (io) {
    io.emit('chat', {
      id: r.rows[0].id,
      channel,
      scopeId: null,
      from: '[시스템]',
      text,
      isAdmin: true,
      createdAt: r.rows[0].created_at,
    });
  }

  res.json({ ok: true });
});

export default router;
