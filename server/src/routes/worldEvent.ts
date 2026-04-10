import { Router } from 'express';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { getActiveEvent, attackBoss, getLeaderboard, getCurrentRaidWeek, getRaidBossForWeek } from '../game/worldEvent.js';
import { loadCharacterOwned } from '../game/character.js';
import { query } from '../db/pool.js';

const router = Router();

// 다음 6주간 레이드 스케줄
router.get('/upcoming', async (_req, res) => {
  const now = new Date();
  const currentWeek = getCurrentRaidWeek(now.getTime());
  // 다음 토요일 18:00 KST 시작 시각 계산
  const weekIdxStart = Math.max(0, currentWeek + (now.getUTCDay() >= 6 && now.getUTCHours() >= 9 ? 1 : 0));
  const list: { weekIdx: number; startAt: string; bossId: number; bossName: string }[] = [];
  const bossR = await query<{ id: number; name: string }>('SELECT id, name FROM world_event_bosses');
  const nameMap = new Map(bossR.rows.map(r => [r.id, r.name]));
  const EPOCH_MS = Date.UTC(2026, 3, 12, 15, 0, 0); // 4월 13일 월요일 00:00 KST
  for (let i = 0; i < 6; i++) {
    const wi = weekIdxStart + i;
    const bossId = getRaidBossForWeek(wi);
    if (!bossId) continue;
    // 해당 주의 토요일 18:00 KST = 월 0시 + 5일 + 18시
    const startMs = EPOCH_MS + wi * 7 * 86400000 + 5 * 86400000 + 18 * 3600000;
    list.push({ weekIdx: wi, startAt: new Date(startMs).toISOString(), bossId, bossName: nameMap.get(bossId) || '?' });
  }
  res.json({ upcoming: list });
});

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
