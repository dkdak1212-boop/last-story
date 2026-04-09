import { Router, type Response } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';

const router = Router();
router.use(authRequired);

async function todayFromDB(): Promise<string> {
  const r = await query<{ d: string }>("SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date::text AS d");
  return r.rows[0].d;
}

// 오늘의 퀘스트 할당 (없으면 랜덤 3개)
async function ensureDailyQuests(characterId: number): Promise<void> {
  const today = await todayFromDB();
  const existing = await query('SELECT id FROM character_daily_quests WHERE character_id = $1 AND assigned_date = $2', [characterId, today]);
  if (existing.rowCount && existing.rowCount > 0) return;

  // 랜덤 3개 선택
  const pool = await query<{ id: number; kind: string; target_count: number }>(
    'SELECT id, kind, target_count FROM daily_quest_pool ORDER BY RANDOM() LIMIT 3'
  );
  for (const q of pool.rows) {
    await query(
      'INSERT INTO character_daily_quests (character_id, quest_pool_id, kind, target_count, assigned_date) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      [characterId, q.id, q.kind, q.target_count, today]
    );
  }
}

// 상태 조회
router.get('/:id/daily-quests', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  await ensureDailyQuests(id);
  const today = await todayFromDB();

  const quests = await query<{ id: number; quest_pool_id: number; kind: string; target_count: number; progress: number; completed: boolean }>(
    'SELECT cdq.id, cdq.quest_pool_id, cdq.kind, cdq.target_count, cdq.progress, cdq.completed FROM character_daily_quests cdq WHERE cdq.character_id = $1 AND cdq.assigned_date = $2',
    [id, today]
  );
  const labels = await query<{ id: number; label: string }>('SELECT id, label FROM daily_quest_pool');
  const labelMap = new Map(labels.rows.map(r => [r.id, r.label]));

  const reward = await query('SELECT 1 FROM daily_quest_rewards WHERE character_id = $1 AND reward_date = $2', [id, today]);
  const allDone = quests.rows.every(q => q.completed);

  res.json({
    quests: quests.rows.map(q => ({
      id: q.id,
      label: labelMap.get(q.quest_pool_id) || q.kind,
      kind: q.kind,
      target: q.target_count,
      progress: Math.min(q.progress, q.target_count),
      completed: q.completed,
    })),
    allCompleted: allDone,
    rewardClaimed: (reward.rowCount ?? 0) > 0,
  });
});

// 보상 수령
router.post('/:id/daily-quests/claim', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const today = await todayFromDB();

  // 이미 수령했는지
  const already = await query('SELECT 1 FROM daily_quest_rewards WHERE character_id = $1 AND reward_date = $2', [id, today]);
  if (already.rowCount && already.rowCount > 0) return res.status(400).json({ error: '이미 보상을 수령했습니다.' });

  // 전부 완료?
  const quests = await query<{ completed: boolean }>(
    'SELECT completed FROM character_daily_quests WHERE character_id = $1 AND assigned_date = $2', [id, today]
  );
  if (quests.rowCount === 0 || !quests.rows.every(q => q.completed)) {
    return res.status(400).json({ error: '모든 임무를 완료해야 합니다.' });
  }

  // 보상: 레벨*500 EXP, 레벨*200 골드, 드롭률 3시간
  const expReward = char.level * 500;
  const goldReward = char.level * 200;
  await query(
    `UPDATE characters SET exp = exp + $1, gold = gold + $2,
     drop_boost_until = GREATEST(COALESCE(drop_boost_until, NOW()), NOW()) + INTERVAL '3 hours'
     WHERE id = $3`,
    [expReward, goldReward, id]);
  await query('INSERT INTO daily_quest_rewards (character_id, reward_date) VALUES ($1, $2)', [id, today]);

  res.json({ exp: expReward, gold: goldReward, dropBoostHours: 3 });
});

export default router;

// 외부에서 호출: 진행도 업데이트
export async function trackDailyQuestProgress(characterId: number, kind: string, amount: number = 1): Promise<void> {
  const today = await todayFromDB();
  await query(
    `UPDATE character_daily_quests
     SET progress = LEAST(progress + $1, target_count),
         completed = (progress + $1 >= target_count)
     WHERE character_id = $2 AND assigned_date = $3 AND kind = $4 AND completed = FALSE`,
    [amount, characterId, today, kind]
  );
}
