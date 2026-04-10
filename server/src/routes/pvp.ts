import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { simulatePvP, calculateEloChange } from '../pvp/simulator.js';
import { deliverToMailbox } from '../game/inventory.js';
import { trackDailyQuestProgress } from './dailyQuests.js';

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
  // 일일 공격 횟수 리셋
  await query(
    `UPDATE pvp_stats SET daily_attacks = 0, last_daily_reset = CURRENT_DATE
     WHERE character_id = $1 AND last_daily_reset < CURRENT_DATE`,
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

  const r = await query<{ character_id: number; name: string; class_name: string; level: number; elo: number; on_cooldown: boolean }>(
    `SELECT ps.character_id, c.name, c.class_name, c.level, ps.elo,
            EXISTS(SELECT 1 FROM pvp_cooldowns WHERE attacker_id = $1 AND defender_id = ps.character_id AND expires_at > NOW()) AS on_cooldown
     FROM pvp_stats ps JOIN characters c ON c.id = ps.character_id
     WHERE ps.character_id <> $1 AND ABS(ps.elo - $2) <= ${ELO_MATCH_RANGE}
     ORDER BY ABS(ps.elo - $2) ASC LIMIT 20`,
    [cid, myElo]
  );
  res.json(r.rows.map(row => ({
    id: row.character_id, name: row.name, className: row.class_name,
    level: row.level, elo: row.elo, onCooldown: row.on_cooldown,
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

// 공격
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
  const statR = await query<{ daily_attacks: number; elo: number }>(
    `SELECT daily_attacks, elo FROM pvp_stats WHERE character_id = $1`, [attackerId]
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

  // 시뮬레이션
  const sim = await simulatePvP(attackerId, defenderId);
  const winnerId = sim.winner === 'attacker' ? attackerId : defenderId;
  const loserId = sim.winner === 'attacker' ? defenderId : attackerId;
  const attackerElo = statR.rows[0].elo;
  const defenderElo = (await query<{ elo: number }>(`SELECT elo FROM pvp_stats WHERE character_id = $1`, [defenderId])).rows[0].elo;
  const winnerElo = winnerId === attackerId ? attackerElo : defenderElo;
  const loserElo = winnerId === attackerId ? defenderElo : attackerElo;
  const eloChange = calculateEloChange(winnerElo, loserElo);

  // ELO & 전적 업데이트
  await query(`UPDATE pvp_stats SET wins = wins + 1, elo = elo + $1 WHERE character_id = $2`, [eloChange, winnerId]);
  await query(`UPDATE pvp_stats SET losses = losses + 1, elo = GREATEST(0, elo - $1) WHERE character_id = $2`, [eloChange, loserId]);

  // 공격자 횟수 + 쿨다운
  await query(`UPDATE pvp_stats SET daily_attacks = daily_attacks + 1 WHERE character_id = $1`, [attackerId]);
  await query(
    `INSERT INTO pvp_cooldowns (attacker_id, defender_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '${COOLDOWN_MINUTES} minutes')
     ON CONFLICT (attacker_id, defender_id)
     DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [attackerId, defenderId]
  );

  // 골드 보상
  const attackerGold = sim.winner === 'attacker' ? WIN_GOLD : LOSS_GOLD;
  await query(`UPDATE characters SET gold = gold + $1 WHERE id = $2`, [attackerGold, attackerId]);
  const defenderGold = sim.winner === 'defender' ? WIN_GOLD : LOSS_GOLD;
  await query(`UPDATE characters SET gold = gold + $1 WHERE id = $2`, [defenderGold, defenderId]);

  // 기록
  await query(
    `INSERT INTO pvp_battles (attacker_id, defender_id, winner_id, elo_change, log)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [attackerId, defenderId, winnerId, sim.winner === 'attacker' ? eloChange : -eloChange, JSON.stringify(sim.log)]
  );

  // 일일임무 진행
  await trackDailyQuestProgress(attackerId, 'pvp_attack', 1);

  // 방어자 우편 알림
  await deliverToMailbox(
    defenderId,
    sim.winner === 'defender' ? 'PvP 방어 성공' : 'PvP 방어 실패',
    `${sim.attackerName}님이 공격했습니다. ${sim.winner === 'defender' ? '승리' : '패배'} (ELO ${sim.winner === 'defender' ? '+' : '-'}${eloChange})`,
    0, 0, defenderGold
  );

  res.json({
    winner: sim.winner,
    log: sim.log,
    eloChange,
    goldGained: attackerGold,
    turns: sim.turns,
  });
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
