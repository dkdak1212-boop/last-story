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
  activeSessions,
  onSessionGoOffline,
} from '../combat/engine.js';
import { settleOfflineRewards } from '../combat/offlineSettle.js';

const router = Router();
router.use(authRequired);

const enterSchema = z.object({ fieldId: z.number().int().positive() });

// /combat/state 자동복구 throttle — 같은 캐릭이 5초 안 반복 호출 시 자동복구 스킵
const autoRestartThrottle = new Map<number, number>();
const AUTO_RESTART_THROTTLE_MS = 5000;

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

  // 오프라인 모드 가드 (2026-04-30): last_offline_at NOT NULL 인 캐릭은 진입 차단.
  // 시공의 균열 통행증 차감/카운트 증가가 먼저 실행된 후 startCombatSession 이
  // silent block 되면 통행증만 날아가는 버그 차단. 사용자는 먼저 오프라인 정산
  // (/resume-from-offline) 후 진입해야 함.
  const offCheck = await query<{ last_offline_at: string | null }>(
    'SELECT last_offline_at FROM characters WHERE id = $1', [id]
  );
  if (offCheck.rows[0]?.last_offline_at) {
    return res.status(400).json({ error: '오프라인 모드입니다. 먼저 오프라인 사냥을 중단해주세요.' });
  }

  // 시공의 균열 (id=23) — Lv.100 + 30분 영속 타이머. 통행증만 있으면 무제한 입장 (2026-04-30: 일일 2회 제한 폐지).
  if (fieldId === 23) {
    const stat = await query<{ rea: string | null }>(
      `SELECT rift_entered_at::text AS rea FROM characters WHERE id = $1`, [id]
    );
    const enteredMs = stat.rows[0]?.rea ? new Date(stat.rows[0].rea).getTime() : 0;
    const isWithinTimer = enteredMs > 0 && Date.now() - enteredMs < 30 * 60_000;
    if (!isWithinTimer) {
      // 30분 타이머 만료 직후 3분 재입장 쿨다운 — 더블클릭/연타로 통행증 2장 소모 방지.
      // 30분 ≤ 경과 < 33분 → 거절.
      const RIFT_REENTER_COOLDOWN_MS = 3 * 60_000;
      if (enteredMs > 0) {
        const sinceLast = Date.now() - enteredMs;
        if (sinceLast >= 30 * 60_000 && sinceLast < 30 * 60_000 + RIFT_REENTER_COOLDOWN_MS) {
          const remainSec = Math.ceil((30 * 60_000 + RIFT_REENTER_COOLDOWN_MS - sinceLast) / 1000);
          return res.status(400).json({ error: `시공의 균열 재입장 쿨다운 — ${remainSec}초 남음 (이중 진입 방지)` });
        }
      }
      // 새 타이머가 필요한 입장 — 차원의 통행증(item 855) 1장 차감.
      // 같은 타이머 안의 재진입(사망/탭이동 후)은 무료.
      const passR = await query<{ id: number; quantity: number }>(
        `SELECT id, quantity FROM character_inventory
          WHERE character_id = $1 AND item_id = 855 AND quantity > 0
          ORDER BY slot_index LIMIT 1`,
        [id]
      );
      if (passR.rowCount === 0) {
        return res.status(400).json({ error: '시공의 균열 — 차원의 통행증이 없습니다. 상점에서 구매 후 입장 가능합니다.' });
      }
      const pass = passR.rows[0];
      if (pass.quantity <= 1) {
        await query('DELETE FROM character_inventory WHERE id = $1', [pass.id]);
      } else {
        await query('UPDATE character_inventory SET quantity = quantity - 1 WHERE id = $1', [pass.id]);
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
  // 사냥터 변경 감지: 이전 필드와 다른 필드 진입 시 EMA 및 사냥터 킬카운트 리셋.
  // 이전 사냥터에서 쌓인 평균 효율(킬속도/드랍률 등)이 새 사냥터의
  // last_field_id_offline 풀에서 잘못 정산되는 버그 차단.
  // current_field_kills 도 0 으로 리셋 — 정산 floor(20킬) 새로 누적.
  const prevField = char.location?.startsWith('field:')
    ? parseInt(char.location.slice(6), 10) : null;
  if (prevField !== null && !Number.isNaN(prevField) && prevField !== fieldId) {
    await query(
      `UPDATE characters SET
          online_exp_rate = 0,
          online_gold_rate = 0,
          online_kill_rate = 0,
          online_drop_rate = 0,
          current_field_kills = 0
        WHERE id = $1`,
      [id]
    );
  }
  await startCombatSession(id, fieldId);
  res.json({ ok: true, resumed: false, emaReset: prevField !== null && prevField !== fieldId });
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

  // 오프라인 모드 — last_offline_at 가 set 이면 자동 정산 안 하고 모드 정보만 반환.
  // 사용자가 "오프라인 사냥 중단" 버튼을 누르면 /combat/resume-from-offline 에서 정산 + 사냥 재개.
  const offR = await query<{ last_offline_at: string | null; last_field_id_offline: number | null }>(
    `SELECT last_offline_at, last_field_id_offline FROM characters WHERE id = $1`, [id]
  );
  if (offR.rows[0]?.last_offline_at) {
    return res.json({
      inCombat: false,
      offlineMode: true,
      offlineSince: offR.rows[0].last_offline_at,
      offlineFieldId: offR.rows[0].last_field_id_offline,
      player: { hp: char.hp, maxHp: char.max_hp },
    });
  }

  let snapshot = await getCombatSnapshot(id);
  // 세션 없음 + 필드 위치 → 자동 재시작 (배포/재시작 후 세션 휘발 복구)
  // throttle: 같은 캐릭 5초 안 반복 자동복구 시도 차단 — burst 시 쿼리 폭주 방지
  const _now = Date.now();
  const _lastTry = autoRestartThrottle.get(id) || 0;
  if (!snapshot && char.location && char.location.startsWith('field:') && _now - _lastTry < AUTO_RESTART_THROTTLE_MS) {
    return res.json({ inCombat: false, player: { hp: char.hp, maxHp: char.max_hp } });
  }
  if (!snapshot && char.location && char.location.startsWith('field:')) {
    autoRestartThrottle.set(id, _now);
    // 메모리 정리 (10분 이상 된 항목 삭제)
    if (autoRestartThrottle.size > 1000) {
      const cutoff = _now - 10 * 60_000;
      for (const [k, v] of autoRestartThrottle) if (v < cutoff) autoRestartThrottle.delete(k);
    }
    const fieldId = parseInt(char.location.slice(6), 10);
    if (!Number.isNaN(fieldId) && fieldId > 0) {
      try {
        // 길드보스(field 999)는 일반 startCombatSession 이 아닌 active run 기반 복원.
        // 일반 호출 시 999의 monster_pool 비어 monster=null 로 "적을 찾는 중" 무한 표시.
        if (fieldId === 999) {
          const runR = await query<{ id: string; boss_id: number }>(
            `SELECT id::text, boss_id FROM guild_boss_runs
              WHERE character_id = $1 AND ended_at IS NULL
              ORDER BY started_at DESC LIMIT 1`,
            [id]
          );
          if (runR.rowCount) {
            const { startGuildBossCombatSession } = await import('../combat/engine.js');
            const { getBossById } = await import('../combat/guildBossHelpers.js');
            const boss = await getBossById(runR.rows[0].boss_id);
            if (boss) {
              await startGuildBossCombatSession(id, runR.rows[0].id, boss);
            }
          }
        } else if (fieldId === 23) {
          // 시공의 균열 자동복구 — 일일 제한 폐지(2026-04-30). 활성 타이머 안이면 무료 복구, 만료/신규는 통행증 1장 차감.
          const stat = await query<{ rea: string | null }>(
            `SELECT rift_entered_at::text AS rea FROM characters WHERE id = $1`, [id]
          );
          const enteredMs = stat.rows[0]?.rea ? new Date(stat.rows[0].rea).getTime() : 0;
          const isWithinTimer = enteredMs > 0 && Date.now() - enteredMs < 30 * 60_000;
          if (!isWithinTimer) {
            // 차원의 통행증 1장 차감 — 새 타이머 시작 시 소모
            const passR = await query<{ id: number; quantity: number }>(
              `SELECT id, quantity FROM character_inventory
                WHERE character_id = $1 AND item_id = 855 AND quantity > 0
                ORDER BY slot_index LIMIT 1`,
              [id]
            );
            if (passR.rowCount === 0) {
              // 통행증 없음 — 자동복구 차단, 마을로
              await query('UPDATE characters SET location=$1 WHERE id=$2', ['village', id]);
            } else {
              const pass = passR.rows[0];
              if (pass.quantity <= 1) {
                await query('DELETE FROM character_inventory WHERE id = $1', [pass.id]);
              } else {
                await query('UPDATE character_inventory SET quantity = quantity - 1 WHERE id = $1', [pass.id]);
              }
              await startCombatSession(id, fieldId);
            }
          } else {
            await startCombatSession(id, fieldId);
          }
        } else {
          await startCombatSession(id, fieldId);
        }
        snapshot = await getCombatSnapshot(id);
      } catch (e) { console.error('[combat] auto-restart fail', id, e); }
    }
  }
  if (!snapshot) {
    return res.json({ inCombat: false, player: { hp: char.hp, maxHp: char.max_hp } });
  }
  res.json(snapshot);
});

// 오프라인 사냥 중단 — 정산 받고 일반 사냥 재개.
router.post('/:id/combat/resume-from-offline', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 1) 정산 (멱등 — last_offline_at NULL 면 즉시 no_offline 반환)
  let offlineReward: Awaited<ReturnType<typeof settleOfflineRewards>> | null = null;
  try {
    const r = await settleOfflineRewards(id);
    if (r.applied) offlineReward = r;
  } catch (e) { console.error('[combat] resume settle err', id, e); }

  // 2) 사냥 재개 — 마지막 필드로 자동 진입 (없으면 마을 머무름)
  if (char.location && char.location.startsWith('field:')) {
    const fieldId = parseInt(char.location.slice(6), 10);
    if (!Number.isNaN(fieldId) && fieldId > 0) {
      try { await startCombatSession(id, fieldId); }
      catch (e) { console.error('[combat] resume start err', id, e); }
    }
  }
  res.json({ ok: true, offlineReward });
});

// 오프라인 전환 미리보기 — 현재 EMA + 시간당 / 8시간 / 24시간 예상 보상.
// 사용자가 보상 없는 상태로 전환하는 혼동 방지.
router.get('/:id/combat/offline-preview', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const r = await query<{
    current_field_kills: number;
    online_exp_rate: number;
    online_gold_rate: number;
    online_kill_rate: number;
    online_drop_rate: number;
  }>(
    `SELECT COALESCE(current_field_kills, 0) AS current_field_kills,
            COALESCE(online_exp_rate, 0)::float8  AS online_exp_rate,
            COALESCE(online_gold_rate, 0)::float8 AS online_gold_rate,
            COALESCE(online_kill_rate, 0)::float8 AS online_kill_rate,
            COALESCE(online_drop_rate, 0)::float8 AS online_drop_rate
       FROM characters WHERE id = $1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return res.status(404).json({ error: 'not found' });

  const MIN_FIELD_KILLS = 20;
  const eligible = row.current_field_kills >= MIN_FIELD_KILLS
    && (row.online_exp_rate > 0 || row.online_gold_rate > 0 || row.online_kill_rate > 0);

  const previewFor = (sec: number) => ({
    exp:    Math.floor(row.online_exp_rate  * sec),
    gold:   Math.floor(row.online_gold_rate * sec),
    kills:  Math.floor(row.online_kill_rate * sec),
    drops:  Math.floor(row.online_kill_rate * sec * (row.online_drop_rate > 0 ? 0.08 : 0)), // 추정
  });

  res.json({
    eligible,
    currentFieldKills: row.current_field_kills,
    minFieldKillsRequired: MIN_FIELD_KILLS,
    rates: {
      expPerSec:  Number(row.online_exp_rate.toFixed(2)),
      goldPerSec: Number(row.online_gold_rate.toFixed(2)),
      killsPerSec: Number(row.online_kill_rate.toFixed(3)),
      dropsPerSec: Number(row.online_drop_rate.toFixed(3)),
    },
    perHour: previewFor(3600),
    cap8h:   previewFor(8 * 3600),
    cap24h:  previewFor(24 * 3600),
  });
});

// 오프라인 전환 — 사용자가 명시적으로 클릭 시 호출.
// last_offline_at = NOW() 기록 + 세션 정리 → 다음 진입 시 EMA 정산.
// 계정당 오프라인 모드 캐릭 최대 2개 제한.
router.post('/:id/combat/go-offline', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const sess = activeSessions.get(id);
  if (!sess) return res.status(400).json({ error: '전투 중이 아닙니다.' });

  // 시공의 균열(23) 은 입장권(1시간) 기반 컨텐츠 — 오프라인 누적 불가
  if (sess.fieldId === 23) {
    return res.status(400).json({ error: '시공의 균열에서는 오프라인 전환이 불가능합니다.' });
  }
  // 길드보스도 시간 제한 컨텐츠 — 오프라인 불가
  if (sess.guildBossRunId) {
    return res.status(400).json({ error: '길드 보스에서는 오프라인 전환이 불가능합니다.' });
  }
  // 허수아비 존(불사 더미 몬스터) — 오프라인 모드 차단. 보상 0 인 dps 측정 컨텐츠라 누적 의미 없음 + 어뷰즈 차단.
  if (sess.monsterName && sess.monsterName.startsWith('허수아비')) {
    return res.status(400).json({ error: '허수아비 존에서는 오프라인 전환이 불가능합니다.' });
  }

  // 계정당 오프라인 모드 캐릭 갯수 체크 (자기 자신 제외, max 2)
  const cntR = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM characters
      WHERE user_id = $1 AND last_offline_at IS NOT NULL AND id <> $2`,
    [req.userId, id]
  );
  if ((cntR.rows[0]?.n ?? 0) >= 2) {
    return res.status(400).json({ error: '오프라인 보상은 계정당 최대 2캐릭까지만 가능합니다.' });
  }

  await onSessionGoOffline(sess, { recordOfflineRewards: true });
  res.json({ ok: true });
});

// 오프라인 전환 취소 — 보상 포기 후 다시 사냥. last_offline_at 즉시 NULL.
router.post('/:id/combat/cancel-offline', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  await query(
    `UPDATE characters
        SET last_offline_at = NULL, last_field_id_offline = NULL,
            offline_buff_snapshot = NULL
      WHERE id = $1`,
    [id]
  );
  res.json({ ok: true });
});

// 오프라인 모드 캐릭 목록 (UI 표기용 — 어느 캐릭이 정산 대기인지)
router.get('/account/offline-list', async (req: AuthedRequest, res: Response) => {
  const r = await query<{ id: number; name: string; level: number; last_offline_at: string; last_field_id_offline: number | null }>(
    `SELECT id, name, level, last_offline_at, last_field_id_offline
       FROM characters
      WHERE user_id = $1 AND last_offline_at IS NOT NULL
      ORDER BY last_offline_at`,
    [req.userId]
  );
  res.json({ list: r.rows, max: 2 });
});

export default router;
