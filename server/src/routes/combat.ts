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
  setAfkMode,
} from '../combat/engine.js';
import { settleOfflineRewards } from '../combat/offlineSettle.js';

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

  // 길드 보스 전용 필드는 /guild-boss/enter 경로로만 진입 가능
  if (fieldId === 999) {
    return res.status(400).json({ error: '길드 보스는 길드 메뉴에서만 진입 가능합니다.' });
  }

  // 시공의 균열 (id=23) — 어드민은 무료, 일반 유저는 「차원의 통행증」 (item 855) 1장 소모.
  // 통행증 발급은 제한적 (일일 임무 / 길드보스 보상) — 신규/입문 유저 출입 게이팅.
  if (fieldId === 23) {
    const adm = await query<{ is_admin: boolean }>('SELECT COALESCE(is_admin, FALSE) AS is_admin FROM users WHERE id = $1', [req.userId]);
    const isAdmin = adm.rows[0]?.is_admin === true;
    if (!isAdmin) {
      // 통행증 1장 원자적 차감 — 같은 캐릭의 통행증 stack 1개 소모
      const passR = await query<{ id: number; quantity: number }>(
        `SELECT id, quantity FROM character_inventory WHERE character_id = $1 AND item_id = 855 AND quantity > 0 ORDER BY slot_index LIMIT 1`,
        [id]
      );
      if (passR.rowCount === 0) {
        return res.status(403).json({ error: '시공의 균열 입장 — 「차원의 통행증」 이 필요합니다. (일일 임무·길드보스 보상)' });
      }
      const stack = passR.rows[0];
      if (stack.quantity <= 1) {
        await query('DELETE FROM character_inventory WHERE id = $1', [stack.id]);
      } else {
        await query('UPDATE character_inventory SET quantity = quantity - 1 WHERE id = $1', [stack.id]);
      }
    }
  }

  const fr = await query<{ required_level: number }>('SELECT required_level FROM fields WHERE id = $1', [fieldId]);
  if (fr.rowCount === 0) return res.status(404).json({ error: 'field not found' });
  if (char.level < fr.rows[0].required_level) {
    return res.status(400).json({ error: 'level too low' });
  }

  // 같은 필드에서 이미 활성 세션 유지 중이면 리셋하지 않고 현재 상태 유지
  const { activeSessions } = await import('../combat/engine.js');
  const existing = activeSessions.get(id);
  const locStr = `field:${fieldId}`;
  if (existing && char.location === locStr) {
    return res.json({ ok: true, resumed: true });
  }
  await startCombatSession(id, fieldId);
  res.json({ ok: true, resumed: false });
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

// 방치(AFK) 모드 토글
router.post('/:id/combat/afk-mode', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const enabled = !!req.body?.enabled;
  const ok = await setAfkMode(id, enabled);
  res.json({ ok, enabled });
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

  // 오프라인 정산 — last_offline_at 이 set 되어 있으면 EMA 기반 보상 적용.
  // Step 2 단계에서는 onSessionGoOffline 미가동이라 대부분 no_offline 으로 즉시 반환.
  // applied 인 경우만 응답에 포함하여 클라가 보상 모달 표시.
  let offlineReward: Awaited<ReturnType<typeof settleOfflineRewards>> | null = null;
  try {
    const r = await settleOfflineRewards(id);
    if (r.applied) offlineReward = r;
  } catch (e) { console.error('[combat] offline settle err', id, e); }

  let snapshot = await getCombatSnapshot(id);
  // 세션 없음 + 필드 위치 → 자동 재시작 (배포/재시작 후 세션 휘발 복구)
  if (!snapshot && char.location && char.location.startsWith('field:')) {
    const fieldId = parseInt(char.location.slice(6), 10);
    if (!Number.isNaN(fieldId) && fieldId > 0) {
      try {
        await startCombatSession(id, fieldId);
        snapshot = await getCombatSnapshot(id);
      } catch (e) { console.error('[combat] auto-restart fail', id, e); }
    }
  }
  if (!snapshot) {
    return res.json({ inCombat: false, player: { hp: char.hp, maxHp: char.max_hp }, offlineReward });
  }
  res.json({ ...snapshot, offlineReward });
});

export default router;
