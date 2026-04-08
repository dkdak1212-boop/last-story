import { Router, type Response } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned, getEquippedItems, getEffectiveStats, getNodeEffects } from '../game/character.js';
import { sumEquipmentStats, sumNodeStats } from '../game/formulas.js';
import { expToNext } from '../game/leveling.js';
import { getCombatHp } from '../combat/engine.js';

const router = Router();
router.use(authRequired);

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
