import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';

const router = Router();
router.use(authRequired);

const schema = z.object({
  hpEnabled: z.boolean(),
  hpThreshold: z.number().int().min(0).max(100),
  mpEnabled: z.boolean(),
  mpThreshold: z.number().int().min(0).max(100),
});

router.post('/:id/potion-settings', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  await query(
    'UPDATE characters SET potion_settings = $1 WHERE id = $2',
    [JSON.stringify(parsed.data), id]
  );
  res.json({ ok: true, settings: parsed.data });
});

export default router;
