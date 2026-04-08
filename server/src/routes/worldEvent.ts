import { Router } from 'express';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { getActiveEvent, attackBoss, getLeaderboard } from '../game/worldEvent.js';
import { loadCharacterOwned } from '../game/character.js';

const router = Router();

// GET /api/world-event/status
router.get('/status', authRequired, async (req: AuthedRequest, res) => {
  const event = await getActiveEvent();
  if (!event) return res.json({ active: false });

  const characterId = Number(req.query.characterId);
  let myDamage: number | undefined;
  let myRank: number | undefined;
  let myAttackCount: number | undefined;

  if (characterId) {
    const { query: dbQuery } = await import('../db/pool.js');
    const my = await dbQuery<{ total_damage: number; attack_count: number; rank: number }>(
      `SELECT total_damage, attack_count,
              (SELECT COUNT(*) + 1 FROM world_event_participants p2
               WHERE p2.event_id = $1 AND p2.total_damage > p.total_damage)::int AS rank
       FROM world_event_participants p
       WHERE event_id = $1 AND character_id = $2`,
      [event.id, characterId]
    );
    if (my.rows[0]) {
      myDamage = my.rows[0].total_damage;
      myRank = my.rows[0].rank;
      myAttackCount = my.rows[0].attack_count;
    }
  }

  const leaderboard = await getLeaderboard(event.id);

  res.json({
    active: true,
    eventId: event.id,
    bossName: event.name,
    bossLevel: event.level,
    currentHp: event.current_hp,
    maxHp: event.max_hp,
    startedAt: event.started_at,
    endsAt: event.ends_at,
    myDamage,
    myRank,
    myAttackCount,
    leaderboard,
  });
});

// POST /api/world-event/attack
router.post('/attack', authRequired, async (req: AuthedRequest, res) => {
  const { characterId } = req.body as { characterId: number };
  if (!characterId) return res.status(400).json({ error: 'characterId required' });

  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(403).json({ error: 'not your character' });

  const { getIo } = await import('../ws/io.js');
  const result = await attackBoss(characterId, getIo() ?? undefined);
  if ('error' in result) {
    return res.status(400).json(result);
  }

  // 보스 처치 시 자동 종료
  if (result.defeated) {
    const event = await getActiveEvent();
    if (event) {
      // finishEvent는 비동기로 처리 (io 없이 — 스케줄러가 곧 감지)
      // 실제로는 이 시점에 io에 접근할 수 없으므로 스케줄러가 처리
    }
  }

  res.json(result);
});

// GET /api/world-event/leaderboard
router.get('/leaderboard', async (_req, res) => {
  const event = await getActiveEvent();
  if (!event) return res.json({ leaderboard: [] });
  const leaderboard = await getLeaderboard(event.id);
  res.json({ leaderboard });
});

export default router;
