import { Router, type Response } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { generateAndApplyOfflineReport } from '../offline/calculate.js';

const router = Router();
router.use(authRequired);

// 캐릭터 선택 시 호출: 오프라인 보상 생성 + 미확인 리포트 반환
router.post('/:id/resume', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const report = await generateAndApplyOfflineReport(id);
  res.json({ report });
});

// 미확인 리포트 확인 처리
router.post('/:id/report/ack', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  await query('UPDATE offline_reports SET delivered = TRUE WHERE character_id = $1 AND delivered = FALSE', [id]);
  res.json({ ok: true });
});

export default router;
