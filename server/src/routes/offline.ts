import { Router, type Response } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned, loadCharacter } from '../game/character.js';
import { generateAndApplyOfflineReport } from '../offline/calculate.js';
import { isInCombat, startCombatSession } from '../combat/engine.js';

const router = Router();
router.use(authRequired);

// 캐릭터 선택 시 호출: 오프라인 보상 생성 + 미확인 리포트 반환 + 필드 복귀 자동 재입장
router.post('/:id/resume', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const report = await generateAndApplyOfflineReport(id);

  // 오프라인 보상 처리 후: 유저가 사냥터(field:X)에 있었으면 전투 세션 자동 재시작
  //   → 브라우저 닫기 전 사냥 중이었던 필드로 원복
  //   → 이미 combat 세션 있으면 재시작 스킵 (재접속 빠른 경우)
  try {
    const full = await loadCharacter(id);
    if (full && full.location.startsWith('field:') && !isInCombat(id)) {
      const fieldId = parseInt(full.location.slice(6), 10);
      if (!Number.isNaN(fieldId) && fieldId > 0) {
        await startCombatSession(id, fieldId);
      }
    }
  } catch (e) {
    console.error('[offline-resume] auto-restart combat fail', id, e);
  }

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
