import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned, getEffectiveStats } from '../game/character.js';
import { processCombatTick } from '../combat/engine.js';

const router = Router();
router.use(authRequired);

const enterSchema = z.object({ fieldId: z.number().int().positive() });

// 필드 진입
router.post('/:id/enter-field', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = enterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { fieldId } = parsed.data;

  // 필드 레벨 체크
  const fr = await query<{ required_level: number }>('SELECT required_level FROM fields WHERE id = $1', [fieldId]);
  if (fr.rowCount === 0) return res.status(404).json({ error: 'field not found' });
  if (char.level < fr.rows[0].required_level) {
    return res.status(400).json({ error: 'level too low' });
  }

  // 유효 스탯 계산
  const eff = await getEffectiveStats(char);

  // 기존 세션 삭제 후 생성
  await query('DELETE FROM combat_sessions WHERE character_id = $1', [id]);
  await query(
    `INSERT INTO combat_sessions
     (character_id, field_id, monster_id, monster_hp, monster_max_hp, monster_stats,
      player_hp, player_mp, player_stats, next_player_action_at, next_monster_action_at)
     VALUES ($1, $2, NULL, 0, 0, '{}'::jsonb, $3, $4, $5, NOW(), NOW())`,
    [id, fieldId, char.hp, char.mp, eff]
  );
  await query('UPDATE characters SET location = $1, last_online_at = NOW() WHERE id = $2',
    [`field:${fieldId}`, id]);

  res.json({ ok: true });
});

// 필드 떠남
router.post('/:id/leave-field', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  await query('DELETE FROM combat_sessions WHERE character_id = $1', [id]);
  await query('UPDATE characters SET location = $1, last_online_at = NOW() WHERE id = $2',
    ['village', id]);
  res.json({ ok: true });
});

// 전투 틱 (폴링 기반)
router.post('/:id/combat/tick', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  try {
    const state = await processCombatTick(id);
    res.json(state);
  } catch (e) {
    console.error('[combat] tick error', e);
    res.status(500).json({ error: 'combat error' });
  }
});

export default router;
