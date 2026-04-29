import { Router, type Response } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { applyExpGain } from '../game/leveling.js';
import { clampCharacterPoints } from '../game/pointClamper.js';
import { invalidateSessionMeta } from '../combat/engine.js';

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
  const pool = await query<{ id: number; kind: string; target_count: number; target_field_id: number | null }>(
    'SELECT id, kind, target_count, target_field_id FROM daily_quest_pool ORDER BY RANDOM() LIMIT 3'
  );
  for (const q of pool.rows) {
    await query(
      'INSERT INTO character_daily_quests (character_id, quest_pool_id, kind, target_count, target_field_id, assigned_date) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
      [characterId, q.id, q.kind, q.target_count, q.target_field_id, today]
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

  // 전부 완료?
  const quests = await query<{ completed: boolean }>(
    'SELECT completed FROM character_daily_quests WHERE character_id = $1 AND assigned_date = $2', [id, today]
  );
  if (quests.rowCount === 0 || !quests.rows.every(q => q.completed)) {
    return res.status(400).json({ error: '모든 임무를 완료해야 합니다.' });
  }

  // INSERT 먼저 시도 (PK 중복 시 0 rows → 이미 수령)
  const inserted = await query(
    'INSERT INTO daily_quest_rewards (character_id, reward_date) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [id, today]
  );
  if (inserted.rowCount === 0) {
    return res.status(400).json({ error: '이미 보상을 수령했습니다.' });
  }

  // 보상: 레벨*500 EXP + EXP/골드/드랍 +50% 3시간 버프 (찢어진 스크롤 지급 제거)
  const expReward = char.level * 500;
  const lvUp = applyExpGain(char.level, char.exp, expReward, char.class_name);
  if (lvUp.levelsGained > 0) {
    await query(
      `UPDATE characters SET
         level = $1,
         exp = $2,
         max_hp = max_hp + $3,
         hp = max_hp + $3,
         node_points = node_points + $4,
         stat_points = COALESCE(stat_points, 0) + $5,
         exp_boost_until = GREATEST(COALESCE(exp_boost_until, NOW()), NOW()) + INTERVAL '3 hours',
         gold_boost_until = GREATEST(COALESCE(gold_boost_until, NOW()), NOW()) + INTERVAL '3 hours',
         drop_boost_until = GREATEST(COALESCE(drop_boost_until, NOW()), NOW()) + INTERVAL '3 hours'
       WHERE id = $6`,
      [lvUp.newLevel, lvUp.newExp, lvUp.hpGained, lvUp.nodePointsGained, lvUp.statPointsGained, id]
    );
    clampCharacterPoints(id).catch(() => {});
  } else {
    await query(
      `UPDATE characters SET
         exp = $1,
         exp_boost_until = GREATEST(COALESCE(exp_boost_until, NOW()), NOW()) + INTERVAL '3 hours',
         gold_boost_until = GREATEST(COALESCE(gold_boost_until, NOW()), NOW()) + INTERVAL '3 hours',
         drop_boost_until = GREATEST(COALESCE(drop_boost_until, NOW()), NOW()) + INTERVAL '3 hours'
       WHERE id = $2`,
      [lvUp.newExp, id]
    );
  }
  // 세션 캐시 무효화 — 다음 combat push 시 새 boost_until 값이 UI 로 반영됨
  invalidateSessionMeta(id);

  // 차원의 통행증 보상 폐기 (2026-04-30) — 통행증 시스템 제거
  res.json({ exp: expReward, boostHours: 3, passGranted: false });
});

export default router;

// 외부에서 호출: 진행도 업데이트
// fieldId가 주어지면 kind='kill_field' 중 target_field_id가 일치하는 퀘스트만 카운트
export async function trackDailyQuestProgress(
  characterId: number, kind: string, amount: number = 1, fieldId?: number
): Promise<void> {
  const today = await todayFromDB();
  if (kind === 'kill_field' && fieldId !== undefined) {
    await query(
      `UPDATE character_daily_quests
       SET progress = LEAST(progress + $1, target_count),
           completed = (progress + $1 >= target_count)
       WHERE character_id = $2 AND assigned_date = $3 AND kind = 'kill_field'
         AND target_field_id = $4 AND completed = FALSE`,
      [amount, characterId, today, fieldId]
    );
    return;
  }
  await query(
    `UPDATE character_daily_quests
     SET progress = LEAST(progress + $1, target_count),
         completed = (progress + $1 >= target_count)
     WHERE character_id = $2 AND assigned_date = $3 AND kind = $4 AND completed = FALSE`,
    [amount, characterId, today, kind]
  );
}
