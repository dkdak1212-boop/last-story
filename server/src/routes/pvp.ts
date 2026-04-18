import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacter, loadCharacterOwned, getEffectiveStats, getNodePassives } from '../game/character.js';
import { calculateEloChange } from '../pvp/simulator.js';
import { trackDailyQuestProgress } from './dailyQuests.js';
import { createPvPSession, toggleAuto, attackerUseSkill, attackerForfeit, attackerPing, sessionSummary } from '../pvp/realtimeEngine.js';
import { loadEquipPrefixes, getCharSkills, buildPassiveMap } from '../combat/engine.js';

const router = Router();
router.use(authRequired);

const DAILY_ATTACK_LIMIT = 15;
const COOLDOWN_MINUTES = 5;
const WIN_GOLD = 500;
const LOSS_GOLD = 50;
const ELO_MATCH_RANGE = 400;

async function ensureStats(characterId: number) {
  await query(
    `INSERT INTO pvp_stats (character_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [characterId]
  );
  // 일일 공격 횟수 리셋 — KST 자정 기준
  await query(
    `UPDATE pvp_stats
       SET daily_attacks = 0,
           last_daily_reset = (NOW() AT TIME ZONE 'Asia/Seoul')::date
     WHERE character_id = $1
       AND last_daily_reset < (NOW() AT TIME ZONE 'Asia/Seoul')::date`,
    [characterId]
  );
}

// 랭킹
router.get('/ranking', async (_req, res) => {
  const r = await query<{ character_id: number; name: string; class_name: string; level: number; wins: number; losses: number; elo: number }>(
    `SELECT ps.character_id, c.name, c.class_name, c.level, ps.wins, ps.losses, ps.elo
     FROM pvp_stats ps JOIN characters c ON c.id = ps.character_id
     JOIN users u ON u.id = c.user_id WHERE u.is_admin = FALSE
     ORDER BY ps.elo DESC, ps.wins DESC LIMIT 100`
  );
  res.json(r.rows.map((row, idx) => ({
    rank: idx + 1, id: row.character_id, name: row.name, className: row.class_name,
    level: row.level, wins: row.wins, losses: row.losses, elo: row.elo,
  })));
});

// 내 PvP 통계
router.get('/stats/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  await ensureStats(cid);
  const r = await query<{ wins: number; losses: number; elo: number; daily_attacks: number }>(
    `SELECT wins, losses, elo, daily_attacks FROM pvp_stats WHERE character_id = $1`, [cid]
  );
  res.json({
    ...r.rows[0],
    dailyAttacks: r.rows[0].daily_attacks,
    dailyLimit: DAILY_ATTACK_LIMIT,
  });
});

// 상대 찾기 (ELO ±200 범위)
router.get('/opponents/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  await ensureStats(cid);
  const myElo = (await query<{ elo: number }>(`SELECT elo FROM pvp_stats WHERE character_id = $1`, [cid])).rows[0].elo;

  const r = await query<{ character_id: number; name: string; class_name: string; level: number; elo: number; on_cooldown: boolean; has_defense: boolean }>(
    `SELECT ps.character_id, c.name, c.class_name, c.level, ps.elo,
            EXISTS(SELECT 1 FROM pvp_cooldowns WHERE attacker_id = $1 AND defender_id = ps.character_id AND expires_at > NOW()) AS on_cooldown,
            EXISTS(SELECT 1 FROM pvp_defense_loadouts WHERE character_id = ps.character_id) AS has_defense
     FROM pvp_stats ps JOIN characters c ON c.id = ps.character_id
     WHERE ps.character_id <> $1 AND ABS(ps.elo - $2) <= ${ELO_MATCH_RANGE}
     ORDER BY ABS(ps.elo - $2) ASC LIMIT 30`,
    [cid, myElo]
  );
  res.json(r.rows.map(row => ({
    id: row.character_id, name: row.name, className: row.class_name,
    level: row.level, elo: row.elo, onCooldown: row.on_cooldown,
    hasDefense: row.has_defense,
  })));
});

// 상대 상세 정보 (공격 전 프리뷰)
router.get('/inspect/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);

  const charR = await query<{ name: string; class_name: string; level: number; max_hp: number }>(
    'SELECT name, class_name, level, max_hp FROM characters WHERE id = $1', [cid]
  );
  if (charR.rowCount === 0) return res.status(404).json({ error: 'not found' });
  const ch = charR.rows[0];

  // 스탯
  const { getEffectiveStats, loadCharacter } = await import('../game/character.js');
  const fullChar = await loadCharacter(cid);
  const eff = fullChar ? await getEffectiveStats(fullChar) : null;

  // PVP 전적
  const pvpR = await query<{ wins: number; losses: number; elo: number }>(
    'SELECT wins, losses, elo FROM pvp_stats WHERE character_id = $1', [cid]
  );
  const pvp = pvpR.rows[0] || { wins: 0, losses: 0, elo: 1000 };

  // 장비
  const eqR = await query<{ slot: string; item_name: string; enhance_level: number }>(
    `SELECT ce.slot, i.name AS item_name, ce.enhance_level
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id
     WHERE ce.character_id = $1`, [cid]
  );

  // 길드
  const guildR = await query<{ guild_name: string }>(
    `SELECT g.name AS guild_name FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id WHERE gm.character_id = $1`, [cid]
  );

  // 스킬
  const skillR = await query<{ name: string; effect_type: string }>(
    `SELECT s.name, s.effect_type FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
     WHERE cs.character_id = $1 AND cs.auto_use = TRUE AND s.cooldown_actions > 0
     ORDER BY s.required_level ASC LIMIT 6`, [cid]
  );

  res.json({
    name: ch.name, className: ch.class_name, level: ch.level,
    maxHp: ch.max_hp,
    stats: eff ? { atk: Math.round(eff.atk), matk: Math.round(eff.matk), def: Math.round(eff.def), mdef: Math.round(eff.mdef), spd: eff.spd, cri: eff.cri, dodge: eff.dodge, accuracy: eff.accuracy } : null,
    pvp: { wins: pvp.wins, losses: pvp.losses, elo: pvp.elo },
    equipment: eqR.rows.map(e => ({ slot: e.slot, name: e.item_name, enhance: e.enhance_level })),
    guild: guildR.rows[0]?.guild_name || null,
    skills: skillR.rows.map(s => s.name),
  });
});

// 공격 — 실시간 전투 세션 생성
router.post('/attack', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    attackerId: z.number().int().positive(),
    defenderId: z.number().int().positive(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { attackerId, defenderId } = parsed.data;
  if (attackerId === defenderId) return res.status(400).json({ error: 'cannot attack self' });

  const char = await loadCharacterOwned(attackerId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  await ensureStats(attackerId);
  await ensureStats(defenderId);

  // 일일 제한
  const statR = await query<{ daily_attacks: number }>(
    `SELECT daily_attacks FROM pvp_stats WHERE character_id = $1`, [attackerId]
  );
  if (statR.rows[0].daily_attacks >= DAILY_ATTACK_LIMIT) {
    return res.status(400).json({ error: '일일 공격 한도 도달' });
  }

  // 쿨다운 체크
  const cd = await query(
    `SELECT 1 FROM pvp_cooldowns WHERE attacker_id = $1 AND defender_id = $2 AND expires_at > NOW()`,
    [attackerId, defenderId]
  );
  if (cd.rowCount && cd.rowCount > 0) return res.status(400).json({ error: '쿨다운 중' });

  // 실시간 세션 생성
  const r = await createPvPSession(attackerId, defenderId);
  if ('error' in r) return res.status(r.status).json({ error: r.error });

  // 일일 공격 카운트 + 쿨다운 세팅 (전투 시작 직후 고정 — 기권/DC 여도 소모)
  await query(`UPDATE pvp_stats SET daily_attacks = daily_attacks + 1 WHERE character_id = $1`, [attackerId]);
  await query(
    `INSERT INTO pvp_cooldowns (attacker_id, defender_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '${COOLDOWN_MINUTES} minutes')
     ON CONFLICT (attacker_id, defender_id)
     DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [attackerId, defenderId]
  );
  await trackDailyQuestProgress(attackerId, 'pvp_attack', 1).catch(() => {});

  res.json({ battleId: r.battleId });
});

// 세션 상태 조회 (재접속용)
router.get('/battle/:battleId', async (req: AuthedRequest, res: Response) => {
  const s = sessionSummary(req.params.battleId);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(s);
});

// 수동 스킬 사용
router.post('/battle/:battleId/use-skill', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ attackerId: z.number().int().positive(), skillId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const char = await loadCharacterOwned(parsed.data.attackerId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const r = attackerUseSkill(req.params.battleId, parsed.data.attackerId, parsed.data.skillId);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true });
});

// 자동/수동 토글
router.post('/battle/:battleId/toggle-auto', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ attackerId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const char = await loadCharacterOwned(parsed.data.attackerId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const ok = toggleAuto(req.params.battleId, parsed.data.attackerId);
  if (!ok) return res.status(400).json({ error: 'invalid session' });
  res.json({ ok: true });
});

// 기권
router.post('/battle/:battleId/forfeit', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ attackerId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const char = await loadCharacterOwned(parsed.data.attackerId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const ok = await attackerForfeit(req.params.battleId, parsed.data.attackerId);
  if (!ok) return res.status(400).json({ error: 'invalid session' });
  res.json({ ok: true });
});

// DC 방지 ping (클라가 5초마다 호출)
router.post('/battle/:battleId/ping', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ attackerId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  attackerPing(req.params.battleId, parsed.data.attackerId);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// 방어 세팅 (스냅샷)
// ─────────────────────────────────────────────
router.get('/defense/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const r = await query<{
    effective_stats: any; skill_slots: number[];
    equipment_summary: any; updated_at: string;
  }>(
    `SELECT effective_stats, skill_slots, equipment_summary, updated_at
     FROM pvp_defense_loadouts WHERE character_id = $1`, [cid]
  );
  if (!r.rowCount) return res.json({ exists: false });
  res.json({
    exists: true,
    stats: r.rows[0].effective_stats,
    skillCount: Array.isArray(r.rows[0].skill_slots) ? r.rows[0].skill_slots.length : 0,
    equipment: r.rows[0].equipment_summary,
    updatedAt: r.rows[0].updated_at,
  });
});

router.post('/defense/:characterId/save', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const full = await loadCharacter(cid);
  if (!full) return res.status(404).json({ error: 'not found' });
  const eff = await getEffectiveStats(full);
  const prefixes = await loadEquipPrefixes(cid);
  const passivesRaw = await getNodePassives(cid);
  const passivesMap = buildPassiveMap(passivesRaw);
  const passives: Record<string, number> = {};
  for (const [k, v] of passivesMap) passives[k] = v;
  const skills = await getCharSkills(cid, full.class_name, full.level);

  // 자동 사용 + cd > 0 스킬만 저장 + slot_order 순 (기본 공격은 AI 가 폴백)
  const defSkills = skills
    .filter(sk => sk.cooldown_actions > 0)
    .sort((a, b) => (a.slot_order || 99) - (b.slot_order || 99))
    .slice(0, 7);
  if (defSkills.length === 0) return res.status(400).json({ error: '사용 가능한 스킬이 없습니다' });

  const skillSlots = defSkills.map(s => s.id);
  const skillsJson = defSkills.map(s => ({
    id: s.id, name: s.name, damage_mult: s.damage_mult, kind: s.kind,
    cooldown_actions: s.cooldown_actions, flat_damage: s.flat_damage,
    effect_type: s.effect_type, effect_value: s.effect_value,
    effect_duration: s.effect_duration, required_level: s.required_level,
    slot_order: s.slot_order, element: s.element, description: s.description,
  }));

  // 장비 요약
  const eqR = await query<{ slot: string; item_id: number; item_name: string; grade: string; enhance_level: number; prefix_ids: number[] | null }>(
    `SELECT ce.slot, ce.item_id, i.name AS item_name, i.grade, ce.enhance_level, ce.prefix_ids
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id
     WHERE ce.character_id = $1`, [cid]
  );
  const equipSummary = eqR.rows.map(r => ({
    slot: r.slot, itemId: r.item_id, name: r.item_name, grade: r.grade,
    enhanceLevel: r.enhance_level, prefixIds: r.prefix_ids || [],
  }));
  if (equipSummary.length === 0) return res.status(400).json({ error: '장비가 없습니다' });

  await query(
    `INSERT INTO pvp_defense_loadouts (character_id, effective_stats, equip_prefixes, passives, skill_slots, skills, equipment_summary, updated_at)
     VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6::jsonb, $7::jsonb, NOW())
     ON CONFLICT (character_id) DO UPDATE SET
       effective_stats = EXCLUDED.effective_stats,
       equip_prefixes = EXCLUDED.equip_prefixes,
       passives = EXCLUDED.passives,
       skill_slots = EXCLUDED.skill_slots,
       skills = EXCLUDED.skills,
       equipment_summary = EXCLUDED.equipment_summary,
       updated_at = NOW()`,
    [cid, JSON.stringify(eff), JSON.stringify(prefixes), JSON.stringify(passives),
     skillSlots, JSON.stringify(skillsJson), JSON.stringify(equipSummary)]
  );

  res.json({ ok: true, skillCount: skillSlots.length, equipCount: equipSummary.length });
});

router.post('/defense/:characterId/clear', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  await query('DELETE FROM pvp_defense_loadouts WHERE character_id = $1', [cid]);
  res.json({ ok: true });
});

// 전투 기록
router.get('/history/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const r = await query<{ id: number; attacker_id: number; defender_id: number; winner_id: number; elo_change: number; log: string[]; created_at: string; attacker_name: string; defender_name: string }>(
    `SELECT b.id, b.attacker_id, b.defender_id, b.winner_id, b.elo_change, b.log, b.created_at,
            a.name AS attacker_name, d.name AS defender_name
     FROM pvp_battles b
     JOIN characters a ON a.id = b.attacker_id
     JOIN characters d ON d.id = b.defender_id
     WHERE b.attacker_id = $1 OR b.defender_id = $1
     ORDER BY b.created_at DESC LIMIT 20`,
    [cid]
  );
  res.json(r.rows.map(row => ({
    id: row.id,
    amAttacker: row.attacker_id === cid,
    attackerName: row.attacker_name,
    defenderName: row.defender_name,
    won: row.winner_id === cid,
    eloChange: row.elo_change,
    log: row.log,
    createdAt: row.created_at,
  })));
});

export default router;
