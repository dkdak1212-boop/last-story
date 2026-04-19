import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { getStartingStats } from '../game/classes.js';
import { getEffectiveStats, loadCharacter } from '../game/character.js';
import { getCombatHp } from '../combat/engine.js';

const router = Router();
router.use(authRequired);

const createSchema = z.object({
  name: z.string().min(2).max(12),
  className: z.enum(['warrior', 'mage', 'cleric', 'rogue', 'summoner']),
});

// 목록
router.get('/', async (req: AuthedRequest, res: Response) => {
  const r = await query(
    `SELECT id, name, class_name AS "className", level, exp, gold,
            hp, max_hp AS "maxHp", node_points AS "nodePoints",
            stats, location, last_online_at AS "lastOnlineAt", created_at AS "createdAt",
            user_id AS "userId", potion_settings AS "potionSettings", title,
            transient_title AS "transientTitle", transient_title_expires_at AS "transientTitleExpiresAt"
     FROM characters WHERE user_id = $1 ORDER BY id`,
    [req.userId]
  );
  res.json(r.rows);
});

// 상세 (effective 스탯 포함)
router.get('/:id', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const r = await query(
    `SELECT id, name, class_name AS "className", level, exp, gold,
            hp, max_hp AS "maxHp", node_points AS "nodePoints",
            stats, location, last_online_at AS "lastOnlineAt", created_at AS "createdAt",
            user_id AS "userId", potion_settings AS "potionSettings", title,
            transient_title AS "transientTitle", transient_title_expires_at AS "transientTitleExpiresAt"
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
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const { name, className } = parsed.data;

  // 캐릭터 슬롯 한도 — 계정당 2개 고정 (다계정 캐릭 양산 방지)
  const MAX_CHAR_SLOTS = 2;
  const curCount = await query<{ cnt: string }>(
    'SELECT COUNT(*)::text AS cnt FROM characters WHERE user_id = $1',
    [req.userId]
  );
  if (Number(curCount.rows[0].cnt) >= MAX_CHAR_SLOTS) {
    return res.status(400).json({ error: `계정당 최대 ${MAX_CHAR_SLOTS}개 캐릭터만 생성 가능` });
  }

  const dup = await query('SELECT 1 FROM characters WHERE name = $1', [name]);
  if (dup.rowCount && dup.rowCount > 0) return res.status(409).json({ error: 'name taken' });

  const start = getStartingStats(className);
  const r = await query(
    `INSERT INTO characters
       (user_id, name, class_name, level, exp, gold, hp, max_hp, node_points, stats, location, last_online_at, newbie_buff_until)
     VALUES ($1, $2, $3, 1, 0, 100, $4, $4, 0, $5, 'village', NOW(), NOW() + INTERVAL '24 hours')
     RETURNING id, name, class_name AS "className", level, exp, gold,
               hp, max_hp AS "maxHp", node_points AS "nodePoints",
               stats, location, last_online_at AS "lastOnlineAt", created_at AS "createdAt",
               user_id AS "userId"`,
    [req.userId, name, className, start.maxHp, start.stats]
  );
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
  res.json({ ok: true });
});

export default router;
