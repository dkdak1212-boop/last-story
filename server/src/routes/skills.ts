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
    await query('INSERT INTO character_skills (character_id, skill_id, auto_use) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING',
      [id, s.id]);
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

// 자동사용 토글
router.post('/:id/skills/:skillId/toggle-auto', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const skillId = Number(req.params.skillId);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  await query(
    `UPDATE character_skills SET auto_use = NOT auto_use
     WHERE character_id = $1 AND skill_id = $2`,
    [id, skillId]
  );
  res.json({ ok: true });
});

export default router;
