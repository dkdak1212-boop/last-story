// 망토 시스템 라우트
// - GET  /cloak/:characterId        — 현재 단계 + 환산 효과 + 정수 인벤토리 보유량
// - POST /cloak/:characterId/apply  — 정수 N개 일괄 사용 → 랜덤 굴림으로 단계 누적
//
// spec: specs/cloak-equipment-system.md
// 정수 1개당 7효과 중 1개 균등 랜덤 선택. 발라카스 +1 / 아트라스 +2 / 카르나스 +3 단계.

import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

const EFFECT_KEYS = ['atk', 'matk', 'speed', 'hp_pct', 'def_pct', 'crit', 'crit_dmg'] as const;
type EffectKey = typeof EFFECT_KEYS[number];

const EFFECT_LABEL: Record<EffectKey, string> = {
  atk: '공격력',
  matk: '마법공격력',
  speed: '스피드',
  hp_pct: '체력',
  def_pct: '방어력',
  crit: '크리티컬',
  crit_dmg: '크리티컬 데미지',
};

// 단계당 증가량 (spec 확정)
const PER_STEP_VALUE: Record<EffectKey, number> = {
  atk: 25,
  matk: 25,
  speed: 2,
  hp_pct: 0.5,
  def_pct: 0.5,
  crit: 0.5,
  crit_dmg: 0.5,
};
const FLAT_KEYS = new Set<EffectKey>(['atk', 'matk', 'speed']);

const ESSENCE_GAIN: Record<string, number> = {
  balacas: 1,
  atras: 2,
  carnas: 3,
};

// 정수 아이템 이름 매핑 — DB 등록 시 사용 (보스 재설정 spec 에서 확정 예정)
const ESSENCE_ITEM_NAME: Record<string, string> = {
  balacas: '발라카스의 정수',
  atras: '아트라스의 정수',
  carnas: '카르나스의 정수',
};

interface LevelsRow {
  atk_lv: number; matk_lv: number; speed_lv: number;
  hp_pct_lv: number; def_pct_lv: number; crit_lv: number; crit_dmg_lv: number;
  total_essences_used: number;
}

function lvColumn(k: EffectKey): string {
  return `${k}_lv`;
}

async function fetchLevels(characterId: number): Promise<LevelsRow> {
  let r = await query<LevelsRow>(
    `SELECT atk_lv, matk_lv, speed_lv, hp_pct_lv, def_pct_lv, crit_lv, crit_dmg_lv, total_essences_used
       FROM character_cloak_levels WHERE character_id = $1`, [characterId]
  );
  if (r.rowCount === 0) {
    await query(
      `INSERT INTO character_cloak_levels (character_id) VALUES ($1)
       ON CONFLICT (character_id) DO NOTHING`, [characterId]
    );
    r = await query<LevelsRow>(
      `SELECT atk_lv, matk_lv, speed_lv, hp_pct_lv, def_pct_lv, crit_lv, crit_dmg_lv, total_essences_used
         FROM character_cloak_levels WHERE character_id = $1`, [characterId]
    );
  }
  return r.rows[0];
}

function effectSummary(lv: LevelsRow) {
  return EFFECT_KEYS.map((k) => {
    const level = lv[lvColumn(k) as keyof LevelsRow] as number;
    const per = PER_STEP_VALUE[k];
    const total = level * per;
    return {
      key: k,
      label: EFFECT_LABEL[k],
      level,
      perStep: per,
      total,
      unit: FLAT_KEYS.has(k) ? 'flat' : 'pct',
    };
  });
}

async function ensureCharOwned(req: AuthedRequest, characterId: number): Promise<boolean> {
  const r = await query<{ user_id: number }>(
    `SELECT user_id FROM characters WHERE id = $1`, [characterId]
  );
  return r.rowCount !== 0 && r.rows[0].user_id === req.userId;
}

// ── GET /cloak/:characterId ─────────────────────────────────────────────
router.get('/:characterId', async (req: AuthedRequest, res: Response) => {
  const characterId = Number(req.params.characterId);
  if (!Number.isFinite(characterId)) return res.status(400).json({ error: 'bad characterId' });
  if (!(await ensureCharOwned(req, characterId))) return res.status(403).json({ error: 'forbidden' });

  const lv = await fetchLevels(characterId);

  // 정수 인벤토리 보유량 — 이름 기반 (보스 재설정 spec 에서 item_id 확정 후 그 id 로 교체 가능)
  const essNames = Object.values(ESSENCE_ITEM_NAME);
  const invR = await query<{ name: string; qty: string }>(
    `SELECT i.name, SUM(ci.quantity)::text AS qty
       FROM character_inventory ci
       JOIN items i ON i.id = ci.item_id
      WHERE ci.character_id = $1 AND i.name = ANY($2::text[])
      GROUP BY i.name`,
    [characterId, essNames]
  );
  const invMap: Record<string, number> = {};
  for (const r of invR.rows) invMap[r.name] = Number(r.qty);
  const essences = Object.entries(ESSENCE_ITEM_NAME).map(([kind, name]) => ({
    kind,
    name,
    owned: invMap[name] ?? 0,
    stepGain: ESSENCE_GAIN[kind],
  }));

  res.json({
    characterId,
    effects: effectSummary(lv),
    totalEssencesUsed: lv.total_essences_used,
    essences,
  });
});

// ── POST /cloak/:characterId/apply ──────────────────────────────────────
// body: { kind: 'balacas'|'atras'|'carnas', count: number }
// 1) 인벤토리 정수 N개 차감 (FOR UPDATE)
// 2) N번 굴림 → 단계 누적
// 3) 굴림 결과 로그 반환
const applySchema = z.object({
  kind: z.enum(['balacas', 'atras', 'carnas']),
  count: z.number().int().min(1).max(99),
});

router.post('/:characterId/apply', async (req: AuthedRequest, res: Response) => {
  const characterId = Number(req.params.characterId);
  if (!Number.isFinite(characterId)) return res.status(400).json({ error: 'bad characterId' });
  if (!(await ensureCharOwned(req, characterId))) return res.status(403).json({ error: 'forbidden' });

  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'bad body' });
  const { kind, count } = parsed.data;
  const stepGain = ESSENCE_GAIN[kind];
  const essName = ESSENCE_ITEM_NAME[kind];

  // 트랜잭션
  const { pool } = await import('../db/pool.js');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 인벤토리 차감 — 같은 정수 여러 stack 가능. quantity 합산 후 부족하면 abort.
    const rows = await client.query<{ id: number; quantity: number }>(
      `SELECT ci.id, ci.quantity
         FROM character_inventory ci
         JOIN items i ON i.id = ci.item_id
        WHERE ci.character_id = $1 AND i.name = $2 AND ci.quantity > 0
        ORDER BY ci.quantity ASC
        FOR UPDATE`,
      [characterId, essName]
    );
    const have = rows.rows.reduce((s, r) => s + r.quantity, 0);
    if (have < count) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `${essName} 부족 (보유 ${have} / 요청 ${count})` });
    }
    let need = count;
    for (const row of rows.rows) {
      if (need <= 0) break;
      const take = Math.min(row.quantity, need);
      if (take >= row.quantity) {
        await client.query('DELETE FROM character_inventory WHERE id = $1', [row.id]);
      } else {
        await client.query('UPDATE character_inventory SET quantity = quantity - $1 WHERE id = $2', [take, row.id]);
      }
      need -= take;
    }

    // 굴림
    const rolls: { key: EffectKey; label: string; gain: number }[] = [];
    const delta: Record<EffectKey, number> = {
      atk: 0, matk: 0, speed: 0, hp_pct: 0, def_pct: 0, crit: 0, crit_dmg: 0,
    };
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * EFFECT_KEYS.length);
      const key = EFFECT_KEYS[idx];
      delta[key] += stepGain;
      rolls.push({ key, label: EFFECT_LABEL[key], gain: stepGain });
    }

    // 단계 가산 UPDATE
    await client.query(
      `INSERT INTO character_cloak_levels (character_id) VALUES ($1)
       ON CONFLICT (character_id) DO NOTHING`,
      [characterId]
    );
    await client.query(
      `UPDATE character_cloak_levels
          SET atk_lv = atk_lv + $1,
              matk_lv = matk_lv + $2,
              speed_lv = speed_lv + $3,
              hp_pct_lv = hp_pct_lv + $4,
              def_pct_lv = def_pct_lv + $5,
              crit_lv = crit_lv + $6,
              crit_dmg_lv = crit_dmg_lv + $7,
              total_essences_used = total_essences_used + $8,
              last_used_at = NOW()
        WHERE character_id = $9`,
      [delta.atk, delta.matk, delta.speed, delta.hp_pct, delta.def_pct, delta.crit, delta.crit_dmg, count, characterId]
    );

    await client.query('COMMIT');

    // 활성 전투 세션에 즉시 반영 (망토 단계가 데미지 계산에 즉시 반영되도록)
    try {
      const { refreshSessionStats } = await import('../combat/engine.js');
      await refreshSessionStats(characterId);
    } catch { /* 세션 없으면 무시 */ }

    const lv = await fetchLevels(characterId);

    // 요약 — 효과별 누적 gain
    const summary = EFFECT_KEYS
      .filter((k) => delta[k] > 0)
      .map((k) => ({ key: k, label: EFFECT_LABEL[k], totalGain: delta[k] }));

    res.json({
      characterId,
      consumed: { kind, name: essName, count },
      summary,
      rolls,
      effects: effectSummary(lv),
      totalEssencesUsed: lv.total_essences_used,
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[cloak/apply] err', e);
    res.status(500).json({ error: 'cloak apply failed' });
  } finally {
    client.release();
  }
});

export default router;
