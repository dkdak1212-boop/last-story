import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned, getEquippedItems, getEffectiveStats, getNodeEffects } from '../game/character.js';
import { sumEquipmentStats, sumNodeStats } from '../game/formulas.js';
import { expToNext } from '../game/leveling.js';
import { getCombatHp } from '../combat/engine.js';

const router = Router();
router.use(authRequired);

const SPENDABLE_STATS = ['str', 'dex', 'int', 'vit', 'spd', 'cri'] as const;

// 스탯 포인트 분배
router.post('/:characterId/spend-stat', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const parsed = z.object({
    stat: z.enum(SPENDABLE_STATS),
    amount: z.number().int().min(1).max(1000).default(1),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const sp = (char as any).stat_points || 0;
  if (sp < parsed.data.amount) return res.status(400).json({ error: '스탯 포인트 부족' });

  const statKey = parsed.data.stat;
  const amt = parsed.data.amount;
  await query(
    `UPDATE characters
       SET stat_points = stat_points - $1,
           stats = jsonb_set(stats, $2::text[], (COALESCE((stats->>$3)::int,0) + $1)::text::jsonb)
     WHERE id = $4`,
    [amt, `{${statKey}}`, statKey, cid]
  );
  res.json({ ok: true });
});

// 캐릭터 종합 상태
router.get('/:characterId/status', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const equipped = await getEquippedItems(cid);
  const equipBonus = sumEquipmentStats(equipped);
  const nodeEffects = await getNodeEffects(cid);
  const nodeBonus = sumNodeStats(nodeEffects);
  const effective = await getEffectiveStats(char);

  const gr = await query<{ name: string; stat_buff_pct: number }>(
    `SELECT g.name, g.stat_buff_pct FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id WHERE gm.character_id = $1`,
    [cid]
  );
  const guildBuff = gr.rows[0] ?? null;

  const expNeed = expToNext(char.level);

  res.json({
    level: char.level,
    exp: char.exp,
    expToNext: expNeed,
    expPercent: Math.round((char.exp / expNeed) * 100),
    gold: char.gold,
    hp: getCombatHp(cid) ?? char.hp,
    nodePoints: char.node_points,
    statPoints: (char as any).stat_points || 0,
    className: char.class_name,
    baseStats: char.stats,
    baseMaxHp: char.max_hp,
    equipBonus,
    nodeBonus,
    effective: {
      str: effective.str, dex: effective.dex, int: effective.int,
      vit: effective.vit, spd: effective.spd, cri: effective.cri,
      maxHp: effective.maxHp,
      atk: Math.round(effective.atk),
      matk: Math.round(effective.matk),
      def: Math.round(effective.def),
      mdef: Math.round(effective.mdef),
      dodge: Math.round(effective.dodge * 10) / 10,
      accuracy: Math.round(effective.accuracy * 10) / 10,
    },
    guildBuff: guildBuff ? { name: guildBuff.name, pct: guildBuff.stat_buff_pct } : null,
  });
});

export default router;
