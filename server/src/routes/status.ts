import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned, getEquippedItems, getEffectiveStats, getNodeEffects, getNodePassives } from '../game/character.js';
import { sumEquipmentStats, sumNodeStats } from '../game/formulas.js';
import { expToNext } from '../game/leveling.js';
import { getCombatHp, refreshSessionStats } from '../combat/engine.js';
import { CLASS_START, type ClassName } from '../game/classes.js';

const router = Router();
router.use(authRequired);

const SPENDABLE_STATS = ['str', 'dex', 'int', 'vit'] as const;
const HP_PER_VIT = 20;

// 스탯 포인트 분배
router.post('/:characterId/spend-stat', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const parsed = z.object({
    stat: z.enum(SPENDABLE_STATS),
    amount: z.number().int().min(1).max(1000).default(1),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const sp = (char as any).stat_points || 0;
  if (sp < parsed.data.amount) return res.status(400).json({ error: '스탯 포인트 부족' });

  const statKey = parsed.data.stat;
  const amt = parsed.data.amount;
  if (statKey === 'vit') {
    // VIT는 max_hp도 함께 +10/point (현재 HP는 그대로 — 회복 효과 없음)
    await query(
      `UPDATE characters
         SET stat_points = stat_points - $1,
             stats = jsonb_set(stats, '{vit}', (COALESCE((stats->>'vit')::int,0) + $1)::text::jsonb),
             max_hp = max_hp + $1 * $2
       WHERE id = $3`,
      [amt, HP_PER_VIT, cid]
    );
  } else {
    await query(
      `UPDATE characters
         SET stat_points = stat_points - $1,
             stats = jsonb_set(stats, $2::text[], (COALESCE((stats->>$3)::int,0) + $1)::text::jsonb)
       WHERE id = $4`,
      [amt, `{${statKey}}`, statKey, cid]
    );
  }
  // 활성 전투 세션 즉시 갱신
  await refreshSessionStats(cid).catch(() => {});
  res.json({ ok: true });
});

// 스탯 초기화 (무료) — 분배한 STR/DEX/INT/VIT를 시작값으로 되돌리고 포인트 환불
router.post('/:characterId/reset-stats', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const start = CLASS_START[char.class_name as ClassName];
  if (!start) return res.status(400).json({ error: '직업 정보 없음' });

  const cur = (char.stats || {}) as unknown as Record<string, number>;
  const spentStr = Math.max(0, (cur.str ?? start.stats.str) - start.stats.str);
  const spentDex = Math.max(0, (cur.dex ?? start.stats.dex) - start.stats.dex);
  const spentInt = Math.max(0, (cur.int ?? start.stats.int) - start.stats.int);
  const spentVit = Math.max(0, (cur.vit ?? start.stats.vit) - start.stats.vit);
  const refund = spentStr + spentDex + spentInt + spentVit;

  if (refund === 0) return res.status(400).json({ error: '환불할 스탯 포인트가 없습니다' });

  // base.stats를 시작값으로 리셋 (spd/cri는 노드/장비 영역이므로 그대로)
  const newStats = {
    ...cur,
    str: start.stats.str,
    dex: start.stats.dex,
    int: start.stats.int,
    vit: start.stats.vit,
  };
  const hpRefund = spentVit * HP_PER_VIT;

  await query(
    `UPDATE characters
       SET stat_points = stat_points + $1,
           stats = $2::jsonb,
           max_hp = GREATEST(1, max_hp - $3),
           hp = LEAST(hp, GREATEST(1, max_hp - $3))
     WHERE id = $4`,
    [refund, JSON.stringify(newStats), hpRefund, cid]
  );

  await refreshSessionStats(cid).catch(() => {});
  res.json({ ok: true, refunded: refund, hpReduced: hpRefund });
});

// 캐릭터 종합 상태
router.get('/:characterId/status', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const equipped = await getEquippedItems(cid);
  const equipBonus = sumEquipmentStats(equipped);
  const nodeEffects = await getNodeEffects(cid);
  const nodeBonus = sumNodeStats(nodeEffects);
  const effective = await getEffectiveStats(char);

  // 접두사 합산 (장비별 prefix_stats)
  const prefixR = await query<{ enhance_level: number; prefix_stats: Record<string, number> | null }>(
    `SELECT ce.enhance_level, ce.prefix_stats FROM character_equipped ce WHERE ce.character_id = $1`,
    [cid]
  );
  const prefixTotals: Record<string, number> = {};
  for (const row of prefixR.rows) {
    if (!row.prefix_stats) continue;
    const mult = 1 + (row.enhance_level || 0) * 0.025;
    for (const [k, v] of Object.entries(row.prefix_stats)) {
      prefixTotals[k] = (prefixTotals[k] || 0) + Math.round((v as number) * mult);
    }
  }

  // 노드 패시브 합산
  const passivesRaw = await getNodePassives(cid);
  const passiveTotals: Record<string, number> = {};
  for (const p of passivesRaw) {
    passiveTotals[p.key] = (passiveTotals[p.key] || 0) + p.value;
  }

  const gr = await query<{ name: string; stat_buff_pct: number }>(
    `SELECT g.name, g.stat_buff_pct FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id WHERE gm.character_id = $1`,
    [cid]
  );
  const guildBuff = gr.rows[0] ?? null;

  // ── 획득 보너스 요약 (gold/exp/drop) ──
  // 소스: 접두사 + 길드 스킬(+ 길드 이벤트 부스트) + 영토 + 개인 부스트 + 글로벌 이벤트
  const { getGuildSkillsForCharacter, GUILD_SKILL_PCT } = await import('../game/guild.js');
  const { getTerritoryBonusForChar } = await import('../game/territory.js');
  const { getActiveGlobalEvent } = await import('../game/globalEvent.js');
  const now = new Date();

  const gskills = await getGuildSkillsForCharacter(cid);
  let guildGoldPct = gskills.gold * GUILD_SKILL_PCT.gold;
  let guildExpPct = gskills.exp * GUILD_SKILL_PCT.exp;
  let guildDropPct = gskills.drop * GUILD_SKILL_PCT.drop;
  try {
    const gbR = await query<{ exp_boost_until: string | null; gold_boost_until: string | null; drop_boost_until: string | null }>(
      `SELECT g.exp_boost_until, g.gold_boost_until, g.drop_boost_until
         FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id WHERE gm.character_id = $1`, [cid]
    );
    if (gbR.rows[0]) {
      if (gbR.rows[0].gold_boost_until && new Date(gbR.rows[0].gold_boost_until) > now) guildGoldPct += 25;
      if (gbR.rows[0].exp_boost_until && new Date(gbR.rows[0].exp_boost_until) > now) guildExpPct += 25;
      if (gbR.rows[0].drop_boost_until && new Date(gbR.rows[0].drop_boost_until) > now) guildDropPct += 25;
    }
  } catch { /* ignore */ }

  const tb = await getTerritoryBonusForChar(cid, 0).catch(() => null);
  const territoryExpPct = tb?.expPct || 0;
  const territoryDropPct = tb?.dropPct || 0;

  const ge = await getActiveGlobalEvent();
  const geGoldPct = Math.max(0, (ge.gold - 1) * 100);
  const geExpPct = Math.max(0, (ge.exp - 1) * 100);
  const geDropPct = Math.max(0, (ge.drop - 1) * 100);

  const boostR = await query<{ gold_boost_until: string | null; exp_boost_until: string | null; drop_boost_until: string | null }>(
    `SELECT gold_boost_until, exp_boost_until, drop_boost_until FROM characters WHERE id = $1`, [cid]
  );
  const br = boostR.rows[0];
  const personalGoldPct = (br?.gold_boost_until && new Date(br.gold_boost_until) > now) ? 50 : 0;
  const personalExpPct = (br?.exp_boost_until && new Date(br.exp_boost_until) > now) ? 50 : 0;
  const personalDropPct = (br?.drop_boost_until && new Date(br.drop_boost_until) > now) ? 50 : 0;

  const prefixGold = prefixTotals.gold_bonus_pct || 0;
  const prefixExp = prefixTotals.exp_bonus_pct || 0;
  const prefixDrop = prefixTotals.drop_rate_pct || 0;

  const gainBonuses = {
    gold: {
      prefix: prefixGold,
      guild: Math.round(guildGoldPct),
      personal: personalGoldPct,
      event: Math.round(geGoldPct),
      total: Math.round(prefixGold + guildGoldPct + personalGoldPct + geGoldPct),
    },
    exp: {
      prefix: prefixExp,
      guild: Math.round(guildExpPct),
      territory: territoryExpPct,
      personal: personalExpPct,
      event: Math.round(geExpPct),
      total: Math.round(prefixExp + guildExpPct + territoryExpPct + personalExpPct + geExpPct),
    },
    drop: {
      prefix: prefixDrop,
      guild: Math.round(guildDropPct),
      territory: territoryDropPct,
      personal: personalDropPct,
      event: Math.round(geDropPct),
      total: Math.round(prefixDrop + guildDropPct + territoryDropPct + personalDropPct + geDropPct),
    },
  };

  const expNeed = expToNext(char.level);

  res.json({
    level: char.level,
    exp: char.exp,
    expToNext: expNeed,
    expPercent: Math.round((char.exp / expNeed) * 100),
    gold: char.gold,
    hp: getCombatHp(cid) ?? char.hp,
    nodePoints: char.node_points,
    statPoints: (char as any).stat_points || 0,
    className: char.class_name,
    baseStats: char.stats,
    baseMaxHp: char.max_hp,
    equipBonus,
    nodeBonus,
    effective: {
      str: effective.str, dex: effective.dex, int: effective.int,
      vit: effective.vit, spd: effective.spd, cri: effective.cri,
      maxHp: effective.maxHp,
      atk: Math.round(effective.atk),
      matk: Math.round(effective.matk),
      def: Math.round(effective.def),
      mdef: Math.round(effective.mdef),
      dodge: Math.round(effective.dodge * 10) / 10,
      accuracy: Math.round(effective.accuracy * 10) / 10,
    },
    guildBuff: guildBuff ? { name: guildBuff.name, pct: guildBuff.stat_buff_pct } : null,
    prefixBonuses: prefixTotals,
    passiveBonuses: passiveTotals,
    gainBonuses,
  });
});

export default router;
