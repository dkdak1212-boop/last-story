import { Router } from 'express';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { getActiveEvent, attackBoss, getLeaderboard } from '../game/worldEvent.js';
import { loadCharacterOwned } from '../game/character.js';

const router = Router();

router.get('/status', authRequired, async (req: AuthedRequest, res) => {
  const event = await getActiveEvent();
  if (!event) return res.json({ active: false });

  const characterId = Number(req.query.characterId);
  let myDamage: number | undefined, myRank: number | undefined, myAttackCount: number | undefined;

  if (characterId) {
    const { query: dbQuery } = await import('../db/pool.js');
    const my = await dbQuery<{ total_damage: number; attack_count: number; rank: number }>(
      `SELECT total_damage, attack_count,
              (SELECT COUNT(*) + 1 FROM world_event_participants p2
               WHERE p2.event_id = $1 AND p2.total_damage > p.total_damage)::int AS rank
       FROM world_event_participants p WHERE event_id = $1 AND character_id = $2`,
      [event.id, characterId]
    );
    if (my.rows[0]) { myDamage = my.rows[0].total_damage; myRank = my.rows[0].rank; myAttackCount = my.rows[0].attack_count; }
  }

  const leaderboard = await getLeaderboard(event.id);
  const hpPct = event.max_hp > 0 ? event.current_hp / event.max_hp : 0;

  res.json({
    active: true, eventId: event.id, bossName: event.name, bossLevel: event.level,
    currentHp: event.current_hp, maxHp: event.max_hp,
    startedAt: event.started_at, endsAt: event.ends_at,
    phase: hpPct > 0.6 ? 1 : hpPct > 0.3 ? 2 : 3,
    myDamage, myRank, myAttackCount, leaderboard,
  });
});

router.post('/attack', authRequired, async (req: AuthedRequest, res) => {
  const { characterId } = req.body as { characterId: number };
  if (!characterId) return res.status(400).json({ error: 'characterId required' });
  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(403).json({ error: 'not your character' });

  const result = await attackBoss(characterId);
  if ('error' in result) return res.status(400).json(result);
  res.json(result);
});

router.get('/leaderboard', async (_req, res) => {
  const event = await getActiveEvent();
  if (!event) return res.json({ leaderboard: [] });
  res.json({ leaderboard: await getLeaderboard(event.id) });
});

export default router;
