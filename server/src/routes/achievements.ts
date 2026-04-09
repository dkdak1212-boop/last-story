import { Router, type Response } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { checkAndUnlockAchievements } from '../game/achievements.js';

const router = Router();
router.use(authRequired);

// 업적 목록
router.get('/:id/achievements', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 자동 체크
  await checkAndUnlockAchievements(id);

  const r = await query<{
    id: number; code: string; name: string; description: string; category: string;
    title_reward: string; unlocked_at: string | null;
  }>(
    `SELECT a.id, a.code, a.name, a.description, a.category, a.title_reward,
            ca.unlocked_at
     FROM achievements a
     LEFT JOIN character_achievements ca ON ca.achievement_id = a.id AND ca.character_id = $1
     ORDER BY a.id`,
    [id]
  );

  res.json({
    achievements: r.rows.map(a => ({
      id: a.id, code: a.code, name: a.name, description: a.description,
      category: a.category, title: a.title_reward,
      unlocked: !!a.unlocked_at,
      unlockedAt: a.unlocked_at,
    })),
    currentTitle: char.title || null,
  });
});

// 칭호 설정
router.post('/:id/achievements/set-title', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const { title } = req.body as { title: string | null };

  if (title) {
    // 해당 칭호의 업적을 달성했는지 확인
    const check = await query(
      `SELECT 1 FROM character_achievements ca JOIN achievements a ON a.id = ca.achievement_id
       WHERE ca.character_id = $1 AND a.title_reward = $2`,
      [id, title]
    );
    if (check.rowCount === 0) return res.status(400).json({ error: '칭호를 달성하지 못했습니다.' });
  }

  await query('UPDATE characters SET title = $1 WHERE id = $2', [title || null, id]);
  res.json({ ok: true, title: title || null });
});

export default router;
