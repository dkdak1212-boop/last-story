import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { getStartingStats } from '../game/classes.js';
import { getEffectiveStats, loadCharacter } from '../game/character.js';
import { getCombatHp, cleanupCharacterFromCombat } from '../combat/engine.js';

const router = Router();
router.use(authRequired);

// 닉네임 규칙: 한글/영문/숫자만 허용 (공백·특수문자 불가), 2~12자
const NICKNAME_RE = /^[가-힣A-Za-z0-9]{2,12}$/;
const createSchema = z.object({
  name: z.string().min(2).max(12).regex(NICKNAME_RE, '닉네임은 공백·특수문자 없이 한글/영문/숫자 2~12자만 가능합니다.'),
  className: z.enum(['warrior', 'mage', 'cleric', 'rogue', 'summoner', 'archer']),
});

// 목록
router.get('/', async (req: AuthedRequest, res: Response) => {
  const r = await query(
    `SELECT id, name, class_name AS "className", level, exp, gold,
            hp, max_hp AS "maxHp", node_points AS "nodePoints",
            stats, location, last_online_at AS "lastOnlineAt", created_at AS "createdAt",
            user_id AS "userId", potion_settings AS "potionSettings", title,
            transient_title AS "transientTitle", transient_title_expires_at AS "transientTitleExpiresAt",
            last_offline_at AS "lastOfflineAt", last_field_id_offline AS "lastFieldIdOffline"
     FROM characters WHERE user_id = $1 ORDER BY id`,
    [req.userId]
  );
  res.json(r.rows);
});

// 캐릭 선택창용 일일 진행 요약 — 한 번의 round-trip 으로 N캐릭 일일임무/길드보스/통행증 상태 반환.
// 사용자 결정(2026-05-10): 캐릭 카드에 dot 3색 표시(빨강/노랑/녹색).
router.get('/daily-summary', async (req: AuthedRequest, res: Response) => {
  const r = await query<{
    character_id: number;
    quests_completed: number;
    quests_total: number;
    quest_reward_claimed: boolean;
    gb_keys_used: number;
    pass_today: boolean;
    unread_mail: number;
    rift_active: boolean;
  }>(
    `WITH today AS (SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date AS d)
     SELECT c.id AS character_id,
            COALESCE((
              SELECT COUNT(*) FILTER (WHERE cdq.completed)
                FROM character_daily_quests cdq, today
               WHERE cdq.character_id = c.id AND cdq.assigned_date = today.d
            ), 0)::int AS quests_completed,
            COALESCE((
              SELECT COUNT(*) FROM character_daily_quests cdq, today
               WHERE cdq.character_id = c.id AND cdq.assigned_date = today.d
            ), 0)::int AS quests_total,
            EXISTS(
              SELECT 1 FROM daily_quest_rewards dqr, today
               WHERE dqr.character_id = c.id AND dqr.reward_date = today.d
            ) AS quest_reward_claimed,
            COALESCE((
              SELECT GREATEST(0, 2 - gbd.keys_remaining)
                FROM guild_boss_daily gbd, today
               WHERE gbd.character_id = c.id AND gbd.date = today.d
            ), 0)::int AS gb_keys_used,
            (
              c.pass_shop_daily_date = (SELECT d FROM today)
              AND COALESCE(c.pass_shop_daily_count, 0) > 0
            ) AS pass_today,
            COALESCE((
              SELECT COUNT(*) FROM mailbox m
               WHERE m.character_id = c.id AND m.read_at IS NULL
            ), 0)::int AS unread_mail,
            (c.rift_entered_at IS NOT NULL
              AND c.rift_entered_at + INTERVAL '30 minutes' > NOW()) AS rift_active
       FROM characters c
      WHERE c.user_id = $1
      ORDER BY c.id`,
    [req.userId]
  );
  // 글로벌 이벤트 — 계정 단위 동일, 한 번만 조회
  const { getActiveGlobalEvent } = await import('../game/globalEvent.js');
  const ge = await getActiveGlobalEvent();
  res.json({
    eventActive: ge.active,
    eventName: ge.name,
    characters: r.rows.map(row => ({
      characterId: row.character_id,
      questsCompleted: row.quests_completed,
      questsTotal: row.quests_total,
      questRewardClaimed: row.quest_reward_claimed,
      gbKeysUsed: row.gb_keys_used,
      passShopBought: row.pass_today,
      unreadMail: row.unread_mail,
      riftActive: row.rift_active,
    })),
  });
});

// 상세 (effective 스탯 포함)
router.get('/:id', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const r = await query(
    `SELECT id, name, class_name AS "className", level, exp, gold,
            hp, max_hp AS "maxHp", node_points AS "nodePoints",
            stats, location, last_online_at AS "lastOnlineAt", created_at AS "createdAt",
            user_id AS "userId", potion_settings AS "potionSettings", title,
            transient_title AS "transientTitle", transient_title_expires_at AS "transientTitleExpiresAt",
            last_offline_at AS "lastOfflineAt", last_field_id_offline AS "lastFieldIdOffline"
     FROM characters WHERE id = $1 AND user_id = $2`,
    [id, req.userId]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });

  // effective 스탯 계산하여 maxHp 등 반영
  const char = await loadCharacter(id);
  if (char) {
    const eff = await getEffectiveStats(char);
    const row = r.rows[0] as Record<string, unknown>;
    // 전투 중이면 인메모리 HP 사용
    const combatHp = getCombatHp(id);
    if (combatHp !== null) row.hp = combatHp;
    row.maxHp = eff.maxHp;
    row.effectiveStats = {
      atk: Math.round(eff.atk),
      matk: Math.round(eff.matk),
      def: Math.round(eff.def),
      mdef: Math.round(eff.mdef),
      dodge: Math.round(eff.dodge * 10) / 10,
      accuracy: Math.round(eff.accuracy * 10) / 10,
      spd: eff.spd,
      cri: eff.cri,
    };
    // 사냥터 이름 추가
    const loc = char.location;
    if (loc?.startsWith('field:')) {
      const fieldId = Number(loc.split(':')[1]);
      const fr = await query<{ name: string }>('SELECT name FROM fields WHERE id = $1', [fieldId]);
      if (fr.rows[0]) row.fieldName = fr.rows[0].name;
    }
  }
  res.json(r.rows[0]);
});

// 생성
router.post('/', async (req: AuthedRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ error: first?.message || 'invalid input' });
  }

  const { name, className } = parsed.data;

  // 캐릭터 슬롯 한도 — 기본 4개 (2026-05-10 변경). 어드민 무제한. users.max_character_slots 컬럼으로
  // 유저별 오버라이드 가능 (운영자가 특정 계정에 더 많은 슬롯 부여).
  const userR = await query<{ is_admin: boolean; max_character_slots: number | null; last_char_deleted_at: string | null }>(
    'SELECT is_admin, max_character_slots, last_char_deleted_at FROM users WHERE id = $1', [req.userId]
  );
  const isAdmin = !!userR.rows[0]?.is_admin;

  // 어드민 전용 직업 가드 — 비-어드민이 admin-only class 시도 시 차단
  const { ADMIN_ONLY_CLASSES, ARCHER_PUBLIC_RELEASE_MS } = await import('../game/classes.js');
  if (ADMIN_ONLY_CLASSES.has(className as any) && !isAdmin) {
    return res.status(403).json({ error: '해당 직업은 어드민 전용입니다' });
  }
  // 궁수 — KST 2026-05-10 09:00 이전엔 어드민만 가능 (시간 게이트)
  if (className === 'archer' && !isAdmin && Date.now() < ARCHER_PUBLIC_RELEASE_MS) {
    return res.status(403).json({ error: '궁수 직업은 2026-05-10 오전 9시(KST)부터 공개됩니다' });
  }
  const slotCap = userR.rows[0]?.max_character_slots ?? 4;
  if (!isAdmin) {
    // 삭제 후 8시간 생성 제한
    const lastDel = userR.rows[0]?.last_char_deleted_at ? new Date(userR.rows[0].last_char_deleted_at).getTime() : 0;
    const COOLDOWN_MS = 8 * 60 * 60 * 1000;
    const elapsed = Date.now() - lastDel;
    if (lastDel > 0 && elapsed < COOLDOWN_MS) {
      const remainingMs = COOLDOWN_MS - elapsed;
      const h = Math.floor(remainingMs / 3600000);
      const m = Math.floor((remainingMs % 3600000) / 60000);
      return res.status(429).json({ error: `캐릭터 삭제 후 8시간 동안 생성 불가. 남은 시간: ${h}시간 ${m}분` });
    }
    const curCount = await query<{ cnt: string }>(
      'SELECT COUNT(*)::text AS cnt FROM characters WHERE user_id = $1',
      [req.userId]
    );
    if (Number(curCount.rows[0].cnt) >= slotCap) {
      return res.status(400).json({ error: `계정당 최대 ${slotCap}개 캐릭터만 생성 가능` });
    }
  }

  const dup = await query('SELECT 1 FROM characters WHERE name = $1', [name]);
  if (dup.rowCount && dup.rowCount > 0) return res.status(409).json({ error: 'name taken' });

  const start = getStartingStats(className);
  const r = await query(
    `INSERT INTO characters
       (user_id, name, class_name, level, exp, gold, hp, max_hp, node_points, stats, location, last_online_at)
     VALUES ($1, $2, $3, 1, 0, 100, $4, $4, 0, $5, 'village', NOW())
     RETURNING id, name, class_name AS "className", level, exp, gold,
               hp, max_hp AS "maxHp", node_points AS "nodePoints",
               stats, location, last_online_at AS "lastOnlineAt", created_at AS "createdAt",
               user_id AS "userId"`,
    [req.userId, name, className, start.maxHp, start.stats]
  );
  // 신규 캐릭 EXP 이벤트 (server_settings 기반) — pct > 0 && until 미도래 시 버프 부여
  try {
    const settR = await query<{ key: string; value: string }>(
      "SELECT key, value FROM server_settings WHERE key IN ('new_char_exp_pct','new_char_exp_until')"
    );
    const m: Record<string, string> = {};
    for (const row of settR.rows) m[row.key] = row.value;
    const pct = Number(m['new_char_exp_pct'] || 0);
    const untilStr = m['new_char_exp_until'] || '';
    const until = untilStr ? new Date(untilStr) : null;
    if (pct > 0 && until && until.getTime() > Date.now()) {
      await query(
        'UPDATE characters SET event_exp_pct = $1, event_exp_until = $2, event_exp_max_level = 100 WHERE id = $3',
        [pct, until.toISOString(), r.rows[0].id]
      );
    }
  } catch (e) {
    console.error('[new-char-event] apply fail', e);
  }
  // 차원새싹상자 Lv.1 자동 발송 (항상)
  try {
    const { sendSproutBoxMail } = await import('./sproutBox.js');
    await sendSproutBoxMail(r.rows[0].id, 1);
  } catch (e) {
    console.error('[sprout-box] lv1 send fail', e);
  }
  // 망토 영구 장착 + cloak_levels 행 생성 (specs/cloak-equipment-system.md)
  try {
    const cidStr = (await query<{ value: string }>(
      `SELECT value FROM server_settings WHERE key = 'cloak_default_item_id'`
    )).rows[0]?.value;
    const cloakItemId = cidStr ? Number(cidStr) : 0;
    if (cloakItemId > 0) {
      await query(
        `INSERT INTO character_equipped (character_id, slot, item_id, enhance_level, soulbound, locked)
         VALUES ($1, 'cloak', $2, 0, TRUE, TRUE)
         ON CONFLICT DO NOTHING`,
        [r.rows[0].id, cloakItemId]
      );
    }
    await query(
      `INSERT INTO character_cloak_levels (character_id) VALUES ($1)
       ON CONFLICT (character_id) DO NOTHING`,
      [r.rows[0].id]
    );
  } catch (e) {
    console.error('[cloak] new-char grant fail', e);
  }
  res.json(r.rows[0]);
});

// 캐릭터 삭제 (관련 데이터 cascade 정리)
const deleteTimestamps = new Map<number, number>();
router.delete('/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const own = await query<{ id: number; level: number }>(
    'SELECT id, level FROM characters WHERE id = $1 AND user_id = $2',
    [cid, req.userId]
  );
  if (own.rowCount === 0) return res.status(404).json({ error: 'not found' });

  // Lv.20 이상: 10분 쿨다운
  if (own.rows[0].level >= 20) {
    const lastDel = deleteTimestamps.get(req.userId!) || 0;
    const elapsed = Date.now() - lastDel;
    if (elapsed < 10 * 60 * 1000) {
      const remaining = Math.ceil((10 * 60 * 1000 - elapsed) / 1000);
      return res.status(429).json({ error: `캐릭터 삭제 쿨타임: ${remaining}초 후 다시 시도해주세요.` });
    }
  }

  // 활성 사냥 세션 + drops 큐 + recentStart 등 모든 in-memory 전투 상태 정리.
  // (DELETE FROM characters 직후 1초 배치에 잔여 drops 가 들어가 FK violation 발생하면
  //  같은 배치의 다른 유저 drops 까지 ROLLBACK 되므로 사전 차단 필수.)
  try {
    await cleanupCharacterFromCombat(cid);
  } catch (err) {
    console.warn(`[char-delete] cleanup err char=${cid}`, err);
  }

  // FK 참조 정리
  const tables = [
    'character_inventory', 'character_equipped', 'character_nodes', 'character_skills',
    'character_skill_presets', 'character_daily_quests', 'character_quests',
    'character_achievements', 'combat_sessions', 'offline_reports', 'mailbox',
    'item_drop_log', 'enhance_log', 'guestbook',
    'guild_members', 'guild_contributions', 'guild_donations_daily',
    'world_event_participants', 'daily_quest_rewards', 'pvp_stats',
  ];
  for (const t of tables) {
    try {
      await query(`DELETE FROM ${t} WHERE character_id = $1`, [cid]);
    } catch { /* 테이블 없으면 스킵 */ }
  }
  // 특수 테이블
  try { await query('DELETE FROM auctions WHERE seller_id = $1', [cid]); } catch {}
  try { await query('UPDATE auctions SET current_bidder_id = NULL WHERE current_bidder_id = $1', [cid]); } catch {}
  try { await query('DELETE FROM pvp_battles WHERE attacker_id = $1 OR defender_id = $1 OR winner_id = $1', [cid]); } catch {}
  try { await query('DELETE FROM pvp_cooldowns WHERE attacker_id = $1 OR defender_id = $1', [cid]); } catch {}
  try { await query('DELETE FROM party_invites WHERE from_id = $1 OR to_id = $1', [cid]); } catch {}
  try { await query('DELETE FROM feedback WHERE character_id = $1', [cid]); } catch {}
  try { await query('DELETE FROM premium_purchases WHERE character_id = $1', [cid]); } catch {}
  // 길드장이면 길드 해산
  try { await query('DELETE FROM guilds WHERE leader_id = $1', [cid]); } catch {}

  await query('DELETE FROM characters WHERE id = $1', [cid]);
  deleteTimestamps.set(req.userId!, Date.now());
  // 삭제 후 8시간 생성 쿨다운을 위해 영속 저장
  await query('UPDATE users SET last_char_deleted_at = NOW() WHERE id = $1', [req.userId]);
  res.json({ ok: true });
});

export default router;
