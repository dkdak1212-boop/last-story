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
  className: z.enum(['warrior', 'mage', 'cleric', 'rogue']),
});

// 목록
router.get('/', async (req: AuthedRequest, res: Response) => {
  const r = await query(
    `SELECT id, name, class_name AS "className", level, exp, gold,
            hp, max_hp AS "maxHp", node_points AS "nodePoints",
            stats, location, last_online_at AS "lastOnlineAt", created_at AS "createdAt",
            user_id AS "userId", potion_settings AS "potionSettings", title
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
            user_id AS "userId", potion_settings AS "potionSettings", title
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

  // 캐릭터 슬롯 한도 체크
  const u = await query<{ max_character_slots: number }>(
    'SELECT COALESCE(max_character_slots, 2) AS max_character_slots FROM users WHERE id = $1',
    [req.userId]
  );
  const maxSlots = u.rows[0]?.max_character_slots || 2;
  const curCount = await query<{ cnt: string }>(
    'SELECT COUNT(*)::text AS cnt FROM characters WHERE user_id = $1',
    [req.userId]
  );
  if (Number(curCount.rows[0].cnt) >= maxSlots) {
    return res.status(400).json({ error: `계정당 최대 ${maxSlots}개 캐릭터만 생성 가능` });
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
  res.json(r.rows[0]);
});

export default router;
