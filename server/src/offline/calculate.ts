// 오프라인 방치 보상 — 온라인 전투 공식 그대로 적용
//
// 설계:
// - killTime = max(simKillTime, recentAvgKillTime)  → farming-abuse 방어
// - dangerous 필드(플레이어 사망 판정): killCount = min(50, elapsed/killTime)
// - 정상 필드: killCount = (elapsed × 0.9) / killTime  → 방치 효율 90%
// - EXP/골드/드랍 공식은 combat/engine.ts 온라인 로직과 1:1 동일
// - 드랍은 per-kill 확률 롤 (Math.random < chance)
// - 장비는 generatePrefixes 로 접두사/품질 per-instance 롤링
// - 드랍필터·자동판매 tier bitmask 온라인과 동일 처리

import { query } from '../db/pool.js';
import { applyExpGain } from '../game/leveling.js';
import { addItemToInventory } from '../game/inventory.js';
import { loadCharacter, getEffectiveStats } from '../game/character.js';
import { calcDamage, type EffectiveStats } from '../game/formulas.js';
import { generatePrefixes } from '../game/prefix.js';

const MAX_OFFLINE_SECONDS = 24 * 3600;
const MIN_OFFLINE_SECONDS = 300;
const GAUGE_MAX = 1000;
const GAUGE_FILL_RATE = 0.1;
const TICK_SEC = 0.1;
const OFFLINE_EFFICIENCY = 0.9;
const MONSTER_GOLD_MULT = 0.5;
const DROP_RATE_MULT = 0.1;

export interface OfflineReport {
  minutesAccounted: number;
  efficiency: number;
  killCount: number;
  expGained: number;
  goldGained: number;
  itemsDropped: { itemId: number; name: string; quantity: number; grade: string }[];
  levelsGained: number;
  overflow: number;
  // 디버그/검증용
  debug?: {
    fieldId: number;
    simKillTimeSec: number;
    realAvgKillTimeSec: number | null;
    usedKillTimeSec: number;
    dangerous: boolean;
    elapsedSec: number;
    cappedSec: number;
    avgExp: number;
    avgGold: number;
    expMult: number;
    goldMult: number;
    dropBonusMult: number;
  };
}

interface SimResult {
  killTimeSec: number;
  dangerous: boolean;
}

// ── 1v1 시뮬레이션: 플레이어 vs 평균 몬스터 (온라인 tick 로직과 동일) ──
function runSim(pEff: EffectiveStats, mEff: EffectiveStats, playerMaxHp: number, monsterMaxHp: number): SimResult {
  let playerHp = playerMaxHp;
  let monsterHp = monsterMaxHp;
  let playerGauge = 0;
  let monsterGauge = 0;
  let time = 0;
  const monsterSpd = Math.max(10, mEff.spd);

  while (playerHp > 0 && monsterHp > 0 && time < 300) {
    playerGauge += pEff.spd * GAUGE_FILL_RATE;
    monsterGauge += monsterSpd * GAUGE_FILL_RATE;
    time += TICK_SEC;

    if (playerGauge >= GAUGE_MAX) {
      playerGauge = 0;
      const useMatk = pEff.matk > pEff.atk;
      const d = calcDamage(pEff, mEff, 1.0, useMatk);
      if (!d.miss) monsterHp -= d.damage;
    }
    if (monsterGauge >= GAUGE_MAX) {
      monsterGauge = 0;
      const d = calcDamage(mEff, pEff, 1.0, false);
      if (!d.miss) playerHp -= d.damage;
    }
  }
  return {
    killTimeSec: time,
    dangerous: playerHp <= 0,
  };
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export async function generateAndApplyOfflineReport(
  characterId: number,
  opts: { dryRun?: boolean } = {},
): Promise<OfflineReport | null> {
  const char = await loadCharacter(characterId);
  if (!char) return null;

  if (!char.location || !char.location.startsWith('field:')) return null;
  const fieldId = parseInt(char.location.slice(6), 10);
  if (Number.isNaN(fieldId)) return null;

  // 2캐릭 상한 (24시간 내 이미 2명 수령하면 스킵)
  if (!opts.dryRun) {
    const recent = await query<{ character_id: number }>(
      `SELECT DISTINCT r.character_id
       FROM offline_reports r JOIN characters c ON c.id = r.character_id
       WHERE c.user_id = $1 AND r.generated_at > NOW() - INTERVAL '24 hours'`,
      [char.user_id]
    );
    const alreadyRewarded = new Set(recent.rows.map(r => r.character_id));
    if (alreadyRewarded.size >= 2 && !alreadyRewarded.has(characterId)) {
      await query('UPDATE characters SET last_online_at = NOW() WHERE id = $1', [characterId]);
      return null;
    }
  }

  // 활성 전투 세션이 있으면 보상 없음 (온라인 중)
  if (!opts.dryRun) {
    const active = await query(`SELECT 1 FROM combat_sessions WHERE character_id = $1`, [characterId]);
    if (active.rowCount && active.rowCount > 0) {
      await query('UPDATE characters SET last_online_at = NOW() WHERE id = $1', [characterId]);
      return null;
    }
  }

  const now = new Date();
  const lastOnline = new Date(char.last_online_at);
  const elapsedSec = (now.getTime() - lastOnline.getTime()) / 1000;
  if (elapsedSec < MIN_OFFLINE_SECONDS) return null;
  const cappedSec = Math.min(elapsedSec, MAX_OFFLINE_SECONDS);

  // 필드 몬스터 풀
  const fr = await query<{ monster_pool: number[] }>('SELECT monster_pool FROM fields WHERE id = $1', [fieldId]);
  if (fr.rowCount === 0) return null;
  const pool = fr.rows[0].monster_pool;

  const mr = await query<{
    id: number; name: string; level: number; max_hp: number;
    exp_reward: number; gold_reward: number;
    stats: { str: number; dex: number; int: number; vit: number; spd: number; cri: number };
    drop_table: { itemId: number; chance: number; minQty: number; maxQty: number }[];
  }>('SELECT id, name, level, max_hp, exp_reward, gold_reward, stats, drop_table FROM monsters WHERE id = ANY($1::int[])', [pool]);
  if (mr.rowCount === 0) return null;
  const monsters = mr.rows;

  // 플레이어 effective stats
  const pEff = await getEffectiveStats(char);

  // 평균 몬스터 effective stats — engine.ts monsterToEffective 와 동일 (Lv.50+ 3배)
  const avgStr = avg(monsters.map(m => m.stats.str));
  const avgDex = avg(monsters.map(m => m.stats.dex));
  const avgInt = avg(monsters.map(m => m.stats.int));
  const avgVit = avg(monsters.map(m => m.stats.vit));
  const avgSpd = avg(monsters.map(m => m.stats.spd));
  const avgCri = avg(monsters.map(m => m.stats.cri));
  const avgHp = avg(monsters.map(m => m.max_hp));
  const avgLv = avg(monsters.map(m => m.level));
  const highTier = avgLv >= 50 ? 3.0 : 1.0;
  const mEff: EffectiveStats = {
    str: avgStr, dex: avgDex, int: avgInt, vit: avgVit, spd: avgSpd, cri: avgCri,
    maxHp: avgHp,
    atk: avgStr * highTier,
    matk: avgInt * 1.2 * highTier,
    def: avgVit * 0.8 * highTier,
    mdef: avgInt * 0.5 * highTier,
    dodge: avgDex * 0.4,
    accuracy: 80 + avgDex * 0.5,
  };

  // 시뮬 + 실제 평균 킬타임
  const sim = runSim(pEff, mEff, pEff.maxHp, avgHp);
  const realAvgR = await query<{ recent_avg_kill_time_sec: string | null }>(
    'SELECT recent_avg_kill_time_sec FROM characters WHERE id = $1', [characterId]
  );
  const realAvg = realAvgR.rows[0]?.recent_avg_kill_time_sec ? Number(realAvgR.rows[0].recent_avg_kill_time_sec) : null;

  // killTime = max(simKillTime, recentAvg)  → farming 후 afk 어뷰 방어
  // 하한 0.5초 (one-shot 방지), 상한 300초 (sim 이 타임아웃까지 갔으면 dangerous 로 간주)
  const realAvgSafe = realAvg && realAvg > 0.5 && realAvg < 300 ? realAvg : 0;
  const killTime = Math.max(0.5, sim.killTimeSec, realAvgSafe);

  let killCount: number;
  if (sim.dangerous) {
    killCount = Math.min(50, Math.floor(cappedSec / killTime));
  } else {
    killCount = Math.floor((cappedSec * OFFLINE_EFFICIENCY) / killTime);
  }
  if (killCount <= 0) return null;

  // ── 온라인 공식과 동일한 보너스 로드 ──
  const { getActiveGlobalEvent } = await import('../game/globalEvent.js');
  const { getGuildSkillsForCharacter, GUILD_SKILL_PCT } = await import('../game/guild.js');
  const { getTerritoryBonusForChar } = await import('../game/territory.js');

  const ge = await getActiveGlobalEvent();
  const guildSkills = await getGuildSkillsForCharacter(characterId);
  const guildExpBonus = guildSkills.exp * GUILD_SKILL_PCT.exp;
  const guildGoldBonus = guildSkills.gold * GUILD_SKILL_PCT.gold;
  const guildDropBonus = guildSkills.drop * GUILD_SKILL_PCT.drop;

  let territoryDropPct = 0;
  try {
    const tb = await getTerritoryBonusForChar(characterId, fieldId);
    territoryDropPct = tb?.dropPct || 0;
  } catch { /* ignore */ }

  // 장착 접두사 — exp_bonus_pct / gold_bonus_pct / drop_rate_pct
  const prefR = await query<{ prefix_stats: Record<string, number> | null; enhance_level: number }>(
    `SELECT prefix_stats, enhance_level FROM character_equipped WHERE character_id = $1`, [characterId]
  );
  let expBonusPct = 0;
  let goldBonusPct = 0;
  let prefixDropBonus = 0;
  for (const row of prefR.rows) {
    if (!row.prefix_stats) continue;
    const mult = 1 + (row.enhance_level || 0) * 0.025;
    if (row.prefix_stats.exp_bonus_pct) expBonusPct += Math.round(row.prefix_stats.exp_bonus_pct * mult);
    if (row.prefix_stats.gold_bonus_pct) goldBonusPct += Math.round(row.prefix_stats.gold_bonus_pct * mult);
    if (row.prefix_stats.drop_rate_pct) prefixDropBonus += Math.round(row.prefix_stats.drop_rate_pct * mult);
  }

  // 부스터 상태
  const boostR = await query<{
    exp_boost_until: string | null; gold_boost_until: string | null; drop_boost_until: string | null;
  }>('SELECT exp_boost_until, gold_boost_until, drop_boost_until FROM characters WHERE id = $1', [characterId]);
  const expBoostActive = !!(boostR.rows[0]?.exp_boost_until && new Date(boostR.rows[0].exp_boost_until) > now);
  const goldBoostActive = !!(boostR.rows[0]?.gold_boost_until && new Date(boostR.rows[0].gold_boost_until) > now);
  const dropBoostActive = !!(boostR.rows[0]?.drop_boost_until && new Date(boostR.rows[0].drop_boost_until) > now);

  // 레벨차 페널티 (평균 몬스터 레벨 기준)
  const { computeLevelDiffExpMult } = await import('../combat/engine.js');
  const levelDiffMult = computeLevelDiffExpMult(char.level, Math.round(avgLv));

  // EXP/골드 — 온라인 공식과 동일
  const avgExpReward = avg(monsters.map(m => m.exp_reward));
  const avgGoldReward = avg(monsters.map(m => m.gold_reward));
  const expMult =
    (expBoostActive ? 1.5 : 1.0) *
    (1 + expBonusPct / 100) *
    (1 + guildExpBonus / 100) *
    ge.exp *
    levelDiffMult;
  const goldMult =
    MONSTER_GOLD_MULT *
    (goldBoostActive ? 1.5 : 1.0) *
    (1 + goldBonusPct / 100) *
    (1 + guildGoldBonus / 100) *
    ge.gold;
  const expGained = Math.floor(killCount * avgExpReward * expMult);
  const goldGained = Math.floor(killCount * avgGoldReward * goldMult);

  // 드랍 보너스 배수
  const dropBoostMult = dropBoostActive ? 1.5 : 1.0;
  const dropBonusMult = 1 + (guildDropBonus + territoryDropPct + prefixDropBonus) / 100;
  const globalDropMult = ge.drop;

  // ── 드랍 per-kill 확률 롤 ──
  // 각 몬스터에 할당된 킬 수 = killCount / pool.length (소수점 반올림)
  // 각 킬마다 drop_table 엔트리별로 Math.random() 롤
  interface DropInstance { itemId: number; quantity: number }
  const dropInstances: DropInstance[] = [];
  const killsPerMonster = killCount / monsters.length;
  for (const m of monsters) {
    for (const d of m.drop_table || []) {
      const effectiveChance = d.chance * DROP_RATE_MULT * dropBoostMult * dropBonusMult * globalDropMult;
      const kills = killsPerMonster;
      // per-kill 확률 롤 — 2400킬 × 드랍 테이블 ~10 = 24000 random 수준, 밀리초급
      for (let k = 0; k < kills; k++) {
        if (Math.random() < effectiveChance) {
          const qty = d.minQty + Math.floor(Math.random() * (d.maxQty - d.minQty + 1));
          if (qty > 0) dropInstances.push({ itemId: d.itemId, quantity: qty });
        }
      }
    }
  }

  // 아이템 메타 일괄 조회
  const dropItemIds = [...new Set(dropInstances.map(d => d.itemId))];
  const itemInfo = new Map<number, { name: string; grade: string; sell_price: number; slot: string | null; required_level: number }>();
  if (dropItemIds.length > 0) {
    const ir = await query<{ id: number; name: string; grade: string; sell_price: number; slot: string | null; required_level: number }>(
      `SELECT id, name, grade, sell_price, slot, COALESCE(required_level, 1) AS required_level FROM items WHERE id = ANY($1::int[])`,
      [dropItemIds]
    );
    for (const r of ir.rows) itemInfo.set(r.id, r);
  }

  // 필터 · 자동판매 설정 — 온라인과 동일 bitmask 로직
  const filterR = await query<{
    auto_dismantle_tiers: number; auto_sell_quality_max: number; auto_sell_protect_prefixes: string[];
    drop_filter_tiers: number; drop_filter_common: boolean; drop_filter_quality_max: number; drop_filter_protect_prefixes: string[];
  }>(
    `SELECT COALESCE(auto_dismantle_tiers, 0) AS auto_dismantle_tiers,
            COALESCE(auto_sell_quality_max, 0) AS auto_sell_quality_max,
            COALESCE(auto_sell_protect_prefixes, '{}') AS auto_sell_protect_prefixes,
            COALESCE(drop_filter_tiers, 0) AS drop_filter_tiers,
            COALESCE(drop_filter_common, FALSE) AS drop_filter_common,
            COALESCE(drop_filter_quality_max, 0) AS drop_filter_quality_max,
            COALESCE(drop_filter_protect_prefixes, '{}') AS drop_filter_protect_prefixes
     FROM characters WHERE id = $1`, [characterId]
  );
  const fConf = filterR.rows[0] || { auto_dismantle_tiers: 0, auto_sell_quality_max: 0, auto_sell_protect_prefixes: [], drop_filter_tiers: 0, drop_filter_common: false, drop_filter_quality_max: 0, drop_filter_protect_prefixes: [] };
  const sellTiers = fConf.auto_dismantle_tiers;
  const sellQualityMax = fConf.auto_sell_quality_max;
  const sellProtect = new Set(fConf.auto_sell_protect_prefixes || []);
  const dfTiers = fConf.drop_filter_tiers;
  const dfQualityMax = fConf.drop_filter_quality_max;
  const dfCommon = fConf.drop_filter_common;
  const dfProtect = new Set(fConf.drop_filter_protect_prefixes || []);
  const hasDropFilter = dfTiers > 0 || dfCommon;

  async function getPrefixStatKeys(ids: number[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const r = await query<{ stat_key: string }>(
      `SELECT stat_key FROM item_prefixes WHERE id = ANY($1::int[])`, [ids]
    );
    return r.rows.map(x => x.stat_key);
  }

  let overflow = 0;
  let filteredSkipped = 0;
  const itemDropAgg = new Map<number, { name: string; grade: string; quantity: number }>();

  // dryRun: 통계만 집계 — 인벤토리/DB 미반영
  for (const drop of dropInstances) {
    const info = itemInfo.get(drop.itemId);
    if (!info) continue;

    // 비장비: 필터 common 외엔 그대로 지급
    if (!info.slot) {
      if (hasDropFilter && dfCommon && info.grade === 'common') {
        filteredSkipped += drop.quantity;
        continue;
      }
      if (!opts.dryRun) {
        const { overflow: ov } = await addItemToInventory(characterId, drop.itemId, drop.quantity);
        if (ov > 0) overflow += ov;
      }
      const agg = itemDropAgg.get(drop.itemId);
      if (agg) agg.quantity += drop.quantity;
      else itemDropAgg.set(drop.itemId, { name: info.name, grade: info.grade, quantity: drop.quantity });
      continue;
    }

    // 장비: 인스턴스마다 prefix + quality 롤
    for (let i = 0; i < drop.quantity; i++) {
      let prefixIds: number[] = [];
      let bonusStats: Record<string, number> = {};
      let maxTier = 0;
      let quality = 0;
      let tierBit = 0;
      let is3Options = false;
      let sellHasProtected = false;
      let dfHasProtected = false;

      if (info.grade !== 'unique') {
        const rolled = await generatePrefixes(info.required_level);
        prefixIds = rolled.prefixIds;
        bonusStats = rolled.bonusStats;
        maxTier = rolled.maxTier;
        quality = Math.floor(Math.random() * 101);
        tierBit = maxTier >= 1 && maxTier <= 4 ? (1 << (maxTier - 1)) : 0;
        is3Options = prefixIds.length >= 3;

        if (prefixIds.length > 0 && (sellProtect.size > 0 || dfProtect.size > 0)) {
          const keys = await getPrefixStatKeys(prefixIds);
          if (sellProtect.size > 0) sellHasProtected = keys.some(k => sellProtect.has(k));
          if (dfProtect.size > 0) dfHasProtected = keys.some(k => dfProtect.has(k));
        }

        // 드랍필터 (유니크/전설 제외)
        if (hasDropFilter && info.grade !== 'legendary') {
          if (dfCommon && info.grade === 'common') { filteredSkipped += 1; continue; }
          if (dfTiers > 0) {
            const dfTierMatch = (dfTiers & tierBit) !== 0;
            const dfQualMatch = dfQualityMax > 0 ? quality <= dfQualityMax : true;
            if (!is3Options && !dfHasProtected && dfTierMatch && dfQualMatch) {
              filteredSkipped += 1;
              continue;
            }
          }
        }

        // 자동판매 (온라인과 동일 — 골드 지급은 없음, 아이템만 소멸)
        if (sellTiers > 0) {
          const tierMatch = (sellTiers & tierBit) !== 0;
          const qualityMatch = sellQualityMax > 0 ? quality <= sellQualityMax : true;
          if (!is3Options && !sellHasProtected && tierMatch && qualityMatch) {
            continue;
          }
        }
      }

      // 인벤토리 지급 (dryRun 이면 스킵)
      if (!opts.dryRun) {
        const preroll = info.grade !== 'unique'
          ? { prefixIds, bonusStats, maxTier, quality }
          : undefined;
        const { overflow: ov } = await addItemToInventory(characterId, drop.itemId, 1, undefined, preroll);
        if (ov > 0) overflow += ov;
      }
      const agg = itemDropAgg.get(drop.itemId);
      if (agg) agg.quantity += 1;
      else itemDropAgg.set(drop.itemId, { name: info.name, grade: info.grade, quantity: 1 });
    }
  }

  // EXP/골드 적용
  const levelUp = applyExpGain(char.level, char.exp, expGained, char.class_name);
  if (!opts.dryRun) {
    if (levelUp.levelsGained > 0) {
      await query(
        `UPDATE characters
         SET level=$1, exp=$2, gold=gold+$3,
             max_hp=max_hp+$4, hp=max_hp+$4,
             node_points=node_points+$5,
             stat_points=COALESCE(stat_points,0)+$7,
             last_online_at=NOW()
         WHERE id=$6`,
        [levelUp.newLevel, levelUp.newExp, goldGained,
         levelUp.hpGained, levelUp.nodePointsGained, characterId,
         levelUp.statPointsGained]
      );
    } else {
      await query(
        'UPDATE characters SET exp=$1, gold=gold+$2, last_online_at=NOW() WHERE id=$3',
        [levelUp.newExp, goldGained, characterId]
      );
    }

    // dangerous → 마을로 복귀
    if (sim.dangerous) {
      await query('UPDATE characters SET location=$1 WHERE id=$2', ['village', characterId]);
      await query('DELETE FROM combat_sessions WHERE character_id=$1', [characterId]);
    }
  }

  const itemsDropped = Array.from(itemDropAgg.entries()).map(([itemId, info]) => ({
    itemId, name: info.name, quantity: info.quantity, grade: info.grade,
  }));

  const report: OfflineReport = {
    minutesAccounted: Math.floor(cappedSec / 60),
    efficiency: sim.dangerous ? 0 : OFFLINE_EFFICIENCY,
    killCount,
    expGained,
    goldGained,
    itemsDropped,
    levelsGained: levelUp.levelsGained,
    overflow,
    debug: {
      fieldId,
      simKillTimeSec: Math.round(sim.killTimeSec * 100) / 100,
      realAvgKillTimeSec: realAvg,
      usedKillTimeSec: Math.round(killTime * 100) / 100,
      dangerous: sim.dangerous,
      elapsedSec: Math.round(elapsedSec),
      cappedSec: Math.round(cappedSec),
      avgExp: Math.round(avgExpReward),
      avgGold: Math.round(avgGoldReward),
      expMult: Math.round(expMult * 1000) / 1000,
      goldMult: Math.round(goldMult * 1000) / 1000,
      dropBonusMult: Math.round(dropBonusMult * 1000) / 1000,
    },
  };

  if (!opts.dryRun) {
    if (filteredSkipped > 0) console.log(`[offline] char ${characterId} filtered ${filteredSkipped} drops`);
    await query(
      `INSERT INTO offline_reports
       (character_id, minutes_accounted, efficiency, kill_count, exp_gained, gold_gained, items_dropped, levels_gained, overflow, delivered)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE)`,
      [characterId, report.minutesAccounted, report.efficiency, report.killCount,
       report.expGained, report.goldGained, JSON.stringify(report.itemsDropped),
       report.levelsGained, report.overflow]
    );
  }

  return report;
}
