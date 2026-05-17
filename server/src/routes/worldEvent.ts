import { Router } from 'express';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { getActiveEvent, attackBoss, getLeaderboard } from '../game/worldEvent.js';
import { loadCharacterOwned, getEffectiveStats } from '../game/character.js';
import { query } from '../db/pool.js';
import { startRaidCombatSession } from '../combat/engine.js';

const router = Router();

const RAID_DEATH_COOLDOWN_MS = 300_000; // 5분 사망 쿨다운 (raid-bosses-v2)
const RAID_MAX_ATTACKS_PER_DAY = 10;     // 일일 입장 한도

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

// raid-bosses-v2 Step 3.5 — /enter: 실시간 전투 세션 진입
router.post('/enter/:characterId', authRequired, async (req: AuthedRequest, res) => {
  const characterId = Number(req.params.characterId);
  if (!characterId) return res.status(400).json({ error: 'characterId required' });
  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(403).json({ error: 'not your character' });

  // 어드민 가드 (테스트 단계)
  const adminR = await query<{ is_admin: boolean }>(
    `SELECT is_admin FROM users WHERE id = $1`, [char.user_id]
  );
  if (!adminR.rowCount || !adminR.rows[0].is_admin) {
    return res.status(403).json({ error: '레이드는 어드민 테스트 단계입니다.' });
  }

  // 활성 보스 조회
  const event = await getActiveEvent();
  if (!event) return res.status(400).json({ error: '진행 중인 레이드가 없습니다.' });
  if (char.level < event.min_level) {
    return res.status(400).json({ error: `Lv.${event.min_level} 이상만 참여 가능합니다.` });
  }

  // 오프라인 모드 가드 — 제거 (사용자 결정 2026-05-17). 레이드는 자유 진입.

  // 입장 횟수 + 사망 쿨다운 체크
  const existing = await query<{ attack_count: number; last_attack_at: string }>(
    `SELECT COALESCE(attack_count, 0) AS attack_count, last_attack_at
       FROM world_event_participants WHERE event_id = $1 AND character_id = $2`,
    [event.id, characterId]
  );
  if (existing.rows[0]) {
    const cnt = Number(existing.rows[0].attack_count);
    if (cnt >= RAID_MAX_ATTACKS_PER_DAY) {
      return res.status(400).json({ error: `일일 입장 ${RAID_MAX_ATTACKS_PER_DAY}회 한도 도달.` });
    }
    // 사망 쿨다운: hp=1 인 캐릭은 5분 안에 재진입 불가
    if (char.hp <= 1 && existing.rows[0].last_attack_at) {
      const elapsed = Date.now() - new Date(existing.rows[0].last_attack_at).getTime();
      if (elapsed < RAID_DEATH_COOLDOWN_MS) {
        const remainMin = Math.ceil((RAID_DEATH_COOLDOWN_MS - elapsed) / 60000);
        return res.status(400).json({
          error: `사망 쿨다운 ${remainMin}분 남음`,
          cooldownMs: RAID_DEATH_COOLDOWN_MS - elapsed,
        });
      }
    }
  }

  // 진입 시 HP 풀피 (성직자 제외) + participants row UPSERT (attack_count +1)
  try {
    if (char.class_name !== 'cleric') {
      const eff = await getEffectiveStats(char);
      await query('UPDATE characters SET hp = $1 WHERE id = $2', [eff.maxHp, characterId]);
    }
  } catch (e) { console.error('[raid] hp refill fail', e); }

  await query(
    `INSERT INTO world_event_participants (event_id, character_id, total_damage, attack_count, last_attack_at)
     VALUES ($1, $2, 0, 1, NOW())
     ON CONFLICT (event_id, character_id) DO UPDATE SET
       attack_count = world_event_participants.attack_count + 1,
       last_attack_at = NOW()`,
    [event.id, characterId]
  );

  // 실시간 전투 세션 시작
  try {
    const startedAtMs = new Date(event.started_at).getTime();
    await startRaidCombatSession(characterId, event.id, startedAtMs);
  } catch (e) {
    console.error('[raid] startRaidCombatSession fail', e);
    return res.status(500).json({ error: '전투 세션 시작 실패' });
  }

  res.json({
    ok: true,
    eventId: event.id,
    bossName: event.name,
    endsAt: event.ends_at,
  });
});

// 옛 10초 시뮬 — deprecated, raid-v3 가 실시간 세션으로 대체.
// 호환성 위해 일단 유지 (어드민 가드는 attackBoss 안에 있음).
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
