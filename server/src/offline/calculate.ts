// 오프라인 방치 보상 — 온라인 실시간 rate 복제
//
// 설계:
// - 온라인 전투 중 flushCharBatch 가 매 1초마다 online_exp_rate / online_gold_rate /
//   online_kill_rate 를 EMA(alpha=0.01) 로 갱신 (약 100초 이동평균)
// - 방치 시 이 rate 를 그대로 elapsed 에 곱해 지급 → '온라인에서 먹던 속도 그대로 반영'
// - 드랍은 kill_rate 로 killCount 산출 후 per-kill 확률 롤 (온라인 rollDrops 공식 동일)
// - 효율 0.9 곱 (잠자는 시간 보정)

import { query } from '../db/pool.js';
import { applyExpGain } from '../game/leveling.js';
import { addItemToInventory } from '../game/inventory.js';
import { loadCharacter } from '../game/character.js';
import { generatePrefixes } from '../game/prefix.js';

const MAX_OFFLINE_SECONDS = 24 * 3600;
const MIN_OFFLINE_SECONDS = 300;
const OFFLINE_EFFICIENCY = 0.9;
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
  debug?: {
    fieldId: number;
    elapsedSec: number;
    cappedSec: number;
    expRatePerSec: number;
    goldRatePerSec: number;
    killRatePerSec: number;
  };
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

  // 2캐릭 상한 — 24h 내 이미 2명 수령 시 3번째 스킵
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

  // 활성 세션 존재 → 온라인 중이므로 보상 없음
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
  const effectiveSec = cappedSec * OFFLINE_EFFICIENCY;

  // 온라인 rate 로드
  const rateR = await query<{ online_exp_rate: string; online_gold_rate: string; online_kill_rate: string }>(
    `SELECT online_exp_rate::text, online_gold_rate::text, online_kill_rate::text FROM characters WHERE id = $1`,
    [characterId]
  );
  const expRate = Number(rateR.rows[0]?.online_exp_rate || 0);
  const goldRate = Number(rateR.rows[0]?.online_gold_rate || 0);
  const killRate = Number(rateR.rows[0]?.online_kill_rate || 0);

  // rate 전부 0 (아직 온라인 활동 기록 없음) → 보상 없음, 메시지 없이 종료
  if (expRate <= 0 && goldRate <= 0 && killRate <= 0) {
    if (!opts.dryRun) {
      await query('UPDATE characters SET last_online_at = NOW() WHERE id = $1', [characterId]);
    }
    return null;
  }

  const expGained = Math.floor(expRate * effectiveSec);
  const goldGained = Math.floor(goldRate * effectiveSec);
  const killCount = Math.floor(killRate * effectiveSec);

  // 드랍 계산 — per-kill 확률 롤 (온라인 공식과 동일)
  // 필드 몬스터 풀 조회
  const fr = await query<{ monster_pool: number[] }>('SELECT monster_pool FROM fields WHERE id = $1', [fieldId]);
  const pool = fr.rows[0]?.monster_pool || [];

  const dropInstances: { itemId: number; quantity: number }[] = [];
  if (pool.length > 0 && killCount > 0) {
    const mr = await query<{
      id: number; drop_table: { itemId: number; chance: number; minQty: number; maxQty: number }[]
    }>('SELECT id, drop_table FROM monsters WHERE id = ANY($1::int[])', [pool]);
    const monsters = mr.rows;

    // 드랍 보너스 공식
    const { getActiveGlobalEvent } = await import('../game/globalEvent.js');
    const { getGuildSkillsForCharacter, GUILD_SKILL_PCT } = await import('../game/guild.js');
    const { getTerritoryBonusForChar } = await import('../game/territory.js');
    const ge = await getActiveGlobalEvent();
    const guildSkills = await getGuildSkillsForCharacter(characterId);
    const guildDropBonus = guildSkills.drop * GUILD_SKILL_PCT.drop;
    let territoryDropPct = 0;
    try {
      const tb = await getTerritoryBonusForChar(characterId, fieldId);
      territoryDropPct = tb?.dropPct || 0;
    } catch { /* ignore */ }
    const prefR = await query<{ prefix_stats: Record<string, number> | null; enhance_level: number }>(
      `SELECT prefix_stats, enhance_level FROM character_equipped WHERE character_id = $1`, [characterId]
    );
    let prefixDropBonus = 0;
    for (const row of prefR.rows) {
      if (!row.prefix_stats) continue;
      const mult = 1 + (row.enhance_level || 0) * 0.025;
      if (row.prefix_stats.drop_rate_pct) prefixDropBonus += Math.round(row.prefix_stats.drop_rate_pct * mult);
    }
    const boostR = await query<{ drop_boost_until: string | null }>(
      'SELECT drop_boost_until FROM characters WHERE id = $1', [characterId]
    );
    const dropBoostActive = !!(boostR.rows[0]?.drop_boost_until && new Date(boostR.rows[0].drop_boost_until) > now);
    const dropBoostMult = dropBoostActive ? 1.5 : 1.0;
    const dropBonusMult = 1 + (guildDropBonus + territoryDropPct + prefixDropBonus) / 100;

    const killsPerMonster = killCount / monsters.length;
    for (const m of monsters) {
      for (const d of m.drop_table || []) {
        const effectiveChance = d.chance * DROP_RATE_MULT * dropBoostMult * dropBonusMult * ge.drop;
        for (let k = 0; k < killsPerMonster; k++) {
          if (Math.random() < effectiveChance) {
            const qty = d.minQty + Math.floor(Math.random() * (d.maxQty - d.minQty + 1));
            if (qty > 0) dropInstances.push({ itemId: d.itemId, quantity: qty });
          }
        }
      }
    }
  }

  // 아이템 메타 + 필터/자동판매 설정
  const dropItemIds = [...new Set(dropInstances.map(d => d.itemId))];
  const itemInfo = new Map<number, { name: string; grade: string; sell_price: number; slot: string | null; required_level: number }>();
  if (dropItemIds.length > 0) {
    const ir = await query<{ id: number; name: string; grade: string; sell_price: number; slot: string | null; required_level: number }>(
      `SELECT id, name, grade, sell_price, slot, COALESCE(required_level, 1) AS required_level FROM items WHERE id = ANY($1::int[])`,
      [dropItemIds]
    );
    for (const r of ir.rows) itemInfo.set(r.id, r);
  }

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

  for (const drop of dropInstances) {
    const info = itemInfo.get(drop.itemId);
    if (!info) continue;

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

        if (sellTiers > 0) {
          const tierMatch = (sellTiers & tierBit) !== 0;
          const qualityMatch = sellQualityMax > 0 ? quality <= sellQualityMax : true;
          if (!is3Options && !sellHasProtected && tierMatch && qualityMatch) {
            continue;
          }
        }
      }

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
  }

  const itemsDropped = Array.from(itemDropAgg.entries()).map(([itemId, info]) => ({
    itemId, name: info.name, quantity: info.quantity, grade: info.grade,
  }));

  const report: OfflineReport = {
    minutesAccounted: Math.floor(cappedSec / 60),
    efficiency: OFFLINE_EFFICIENCY,
    killCount,
    expGained,
    goldGained,
    itemsDropped,
    levelsGained: levelUp.levelsGained,
    overflow,
    debug: {
      fieldId,
      elapsedSec: Math.round(elapsedSec),
      cappedSec: Math.round(cappedSec),
      expRatePerSec: Math.round(expRate * 100) / 100,
      goldRatePerSec: Math.round(goldRate * 100) / 100,
      killRatePerSec: Math.round(killRate * 10000) / 10000,
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
