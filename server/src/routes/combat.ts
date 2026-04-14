import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import {
  startCombatSession,
  stopCombatSession,
  toggleAutoMode,
  manualSkillUse,
  getCombatSnapshot,
  setAutoPotionConfig,
  getAutoPotionConfig,
  resetDummyTracking,
} from '../combat/engine.js';

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

  const fr = await query<{ required_level: number }>('SELECT required_level FROM fields WHERE id = $1', [fieldId]);
  if (fr.rowCount === 0) return res.status(404).json({ error: 'field not found' });
  if (char.level < fr.rows[0].required_level) {
    return res.status(400).json({ error: 'level too low' });
  }

  await startCombatSession(id, fieldId);
  res.json({ ok: true });
});

// 필드 떠남
router.post('/:id/leave-field', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  await stopCombatSession(id);
  res.json({ ok: true });
});

// 자동/수동 토글
router.post('/:id/combat/toggle-auto', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const autoMode = toggleAutoMode(id);
  res.json({ ok: true, autoMode });
});

// 수동 스킬 사용
router.post('/:id/combat/use-skill', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const { skillId } = req.body;
  if (!skillId) return res.status(400).json({ error: 'skillId required' });

  const ok = await manualSkillUse(id, Number(skillId));
  res.json({ ok });
});

// 허수아비 존: 측정 초기화
router.post('/:id/combat/dummy-reset', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const ok = resetDummyTracking(id);
  res.json({ ok });
});

// 자동 물약 설정
router.post('/:id/combat/auto-potion', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const { enabled, threshold } = req.body;
  const result = await setAutoPotionConfig(id, !!enabled, Number(threshold) || 30);
  if (!result) return res.status(400).json({ error: 'not in combat' });
  res.json({ ok: true, ...result });
});

// 자동 물약 설정 조회
router.get('/:id/combat/auto-potion', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const result = getAutoPotionConfig(id);
  res.json(result || { enabled: true, threshold: 30 });
});

// 현재 전투 상태 조회 (폴백)
router.get('/:id/combat/state', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const snapshot = await getCombatSnapshot(id);
  if (!snapshot) {
    return res.json({ inCombat: false, player: { hp: char.hp, maxHp: char.max_hp } });
  }
  res.json(snapshot);
});

export default router;
