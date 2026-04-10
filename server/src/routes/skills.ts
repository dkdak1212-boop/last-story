import { Router, type Response } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';

const router = Router();
router.use(authRequired);

// 클래스의 모든 스킬 + 학습/자동 여부
router.get('/:id/skills', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 요구 레벨 만족한 스킬 자동 학습
  const newSkills = await query<{ id: number }>(
    `SELECT s.id FROM skills s
     WHERE s.class_name = $1 AND s.required_level <= $2
       AND NOT EXISTS (SELECT 1 FROM character_skills cs WHERE cs.character_id = $3 AND cs.skill_id = s.id)`,
    [char.class_name, char.level, id]
  );
  for (const s of newSkills.rows) {
    // 슬롯 여유 있으면 ON, 없으면 OFF로 학습
    const countR = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
       WHERE cs.character_id = $1 AND cs.auto_use = TRUE AND s.cooldown_actions > 0`, [id]
    );
    const autoOn = Number(countR.rows[0].cnt) < 6;
    await query('INSERT INTO character_skills (character_id, skill_id, auto_use) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [id, s.id, autoOn]);
  }

  const r = await query<{
    id: number; name: string; description: string; cooldown_actions: number;
    damage_mult: number; flat_damage: number; effect_type: string;
    required_level: number; auto_use: boolean | null;
  }>(
    `SELECT s.id, s.name, s.description, s.cooldown_actions, s.damage_mult, s.flat_damage,
            s.effect_type, s.required_level, cs.auto_use
     FROM skills s
     LEFT JOIN character_skills cs ON cs.skill_id = s.id AND cs.character_id = $1
     WHERE s.class_name = $2 ORDER BY s.required_level ASC`,
    [id, char.class_name]
  );

  res.json(r.rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    cooldown: row.cooldown_actions,
    damageMult: Number(row.damage_mult),
    flatDamage: row.flat_damage,
    effectType: row.effect_type,
    requiredLevel: row.required_level,
    learned: char.level >= row.required_level,
    autoUse: row.auto_use ?? false,
  })));
});

// 자동사용 토글 (최대 6개 제한)
router.post('/:id/skills/:skillId/toggle-auto', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const skillId = Number(req.params.skillId);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 현재 상태 확인
  const cur = await query<{ auto_use: boolean }>(
    'SELECT auto_use FROM character_skills WHERE character_id = $1 AND skill_id = $2', [id, skillId]
  );
  if (cur.rowCount === 0) return res.status(404).json({ error: 'skill not found' });

  const isOn = cur.rows[0].auto_use;
  if (!isOn) {
    // ON으로 전환 시 6개 제한 체크 (기본기 제외)
    const countR = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
       WHERE cs.character_id = $1 AND cs.auto_use = TRUE AND s.cooldown_actions > 0`, [id]
    );
    if (Number(countR.rows[0].cnt) >= 6) {
      return res.status(400).json({ error: '자동 스킬은 최대 6개까지 설정 가능합니다.' });
    }
  }

  await query(
    `UPDATE character_skills SET auto_use = NOT auto_use
     WHERE character_id = $1 AND skill_id = $2`,
    [id, skillId]
  );
  // 전투 중이면 세션 스킬 목록 갱신
  try {
    const { refreshSessionSkills } = await import('../combat/engine.js');
    await refreshSessionSkills(id);
  } catch {}
  res.json({ ok: true });
});

// ─── 스킬 프리셋 (3개 슬롯) ───

// 프리셋 목록 조회
router.get('/:id/skill-presets', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const r = await query<{ preset_idx: number; name: string; skill_ids: number[] }>(
    `SELECT preset_idx, name, skill_ids FROM character_skill_presets WHERE character_id = $1 ORDER BY preset_idx`,
    [id]
  );
  // 3개 슬롯 보장
  const presets = [1, 2, 3].map(idx => {
    const found = r.rows.find(row => row.preset_idx === idx);
    return {
      idx,
      name: found?.name || `프리셋 ${idx}`,
      skillIds: found?.skill_ids || [],
      empty: !found || (found.skill_ids?.length ?? 0) === 0,
    };
  });
  res.json(presets);
});

// 현재 자동 스킬을 프리셋 슬롯에 저장
router.post('/:id/skill-presets/:idx/save', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const idx = Number(req.params.idx);
  if (![1, 2, 3].includes(idx)) return res.status(400).json({ error: 'invalid preset index' });
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const name = (req.body?.name || `프리셋 ${idx}`).toString().slice(0, 20);

  // 현재 ON된 자동스킬 (기본기 제외)
  const current = await query<{ skill_id: number }>(
    `SELECT cs.skill_id FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
     WHERE cs.character_id = $1 AND cs.auto_use = TRUE AND s.cooldown_actions > 0
     ORDER BY s.required_level ASC`,
    [id]
  );
  const skillIds = current.rows.map(r => r.skill_id);

  await query(
    `INSERT INTO character_skill_presets (character_id, preset_idx, name, skill_ids)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (character_id, preset_idx)
     DO UPDATE SET name = EXCLUDED.name, skill_ids = EXCLUDED.skill_ids`,
    [id, idx, name, skillIds]
  );
  res.json({ ok: true, savedCount: skillIds.length, name });
});

// 프리셋 불러오기 (character_skills.auto_use 갱신)
router.post('/:id/skill-presets/:idx/load', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const idx = Number(req.params.idx);
  if (![1, 2, 3].includes(idx)) return res.status(400).json({ error: 'invalid preset index' });
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const presetR = await query<{ skill_ids: number[]; name: string }>(
    `SELECT skill_ids, name FROM character_skill_presets WHERE character_id = $1 AND preset_idx = $2`,
    [id, idx]
  );
  if (presetR.rowCount === 0) return res.status(404).json({ error: '저장된 프리셋이 없습니다' });

  const skillIds = presetR.rows[0].skill_ids || [];
  // 6개 초과 방지
  if (skillIds.length > 6) return res.status(400).json({ error: '프리셋에 스킬이 너무 많습니다 (6개 초과)' });

  // 모든 자동스킬 OFF (기본기 제외)
  await query(
    `UPDATE character_skills cs SET auto_use = FALSE
     FROM skills s WHERE s.id = cs.skill_id AND cs.character_id = $1 AND s.cooldown_actions > 0`,
    [id]
  );
  // 프리셋 스킬만 ON (학습한 것만)
  if (skillIds.length > 0) {
    await query(
      `UPDATE character_skills cs SET auto_use = TRUE
       FROM skills s WHERE s.id = cs.skill_id AND cs.character_id = $1 AND s.id = ANY($2::int[])
         AND s.required_level <= $3`,
      [id, skillIds, char.level]
    );
  }
  // 전투 중이면 세션 스킬 갱신
  try {
    const { refreshSessionSkills } = await import('../combat/engine.js');
    await refreshSessionSkills(id);
  } catch {}
  res.json({ ok: true, loadedCount: skillIds.length, name: presetR.rows[0].name });
});

// 프리셋 이름 변경
router.post('/:id/skill-presets/:idx/rename', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const idx = Number(req.params.idx);
  if (![1, 2, 3].includes(idx)) return res.status(400).json({ error: 'invalid preset index' });
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const name = (req.body?.name || '').toString().trim().slice(0, 20);
  if (!name) return res.status(400).json({ error: '이름을 입력하세요' });

  // 프리셋이 없으면 빈 슬롯으로 생성
  await query(
    `INSERT INTO character_skill_presets (character_id, preset_idx, name, skill_ids)
     VALUES ($1, $2, $3, '{}')
     ON CONFLICT (character_id, preset_idx) DO UPDATE SET name = EXCLUDED.name`,
    [id, idx, name]
  );
  res.json({ ok: true, name });
});

export default router;
