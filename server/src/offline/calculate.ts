// 오프라인 진행 보상 — 온라인 전투와 동일 구조 시뮬레이션
import { query } from '../db/pool.js';
import { applyExpGain } from '../game/leveling.js';
import { addItemToInventory, deliverToMailbox } from '../game/inventory.js';
import { loadCharacter, getEffectiveStats } from '../game/character.js';
import { calcDamage, type EffectiveStats } from '../game/formulas.js';

const MAX_OFFLINE_SECONDS = 24 * 3600;
const MIN_OFFLINE_SECONDS = 300; // 최소 5분
const DEFAULT_EFFICIENCY = 1.0;
const PREMIUM_EFFICIENCY = 1.0;
const GAUGE_MAX = 1000;
const GAUGE_FILL_RATE = 0.1; // 온라인 엔진과 동일 (100ms 틱)
const TICK_SEC = 0.1;

interface SkillDef {
  id: number; name: string; damage_mult: number; cooldown_actions: number;
  flat_damage: number; effect_type: string; effect_value: number;
}

interface OfflineReport {
  minutesAccounted: number;
  efficiency: number;
  killCount: number;
  expGained: number;
  goldGained: number;
  itemsDropped: { itemId: number; name: string; quantity: number; grade: string }[];
  levelsGained: number;
  overflow: number;
}

export async function generateAndApplyOfflineReport(
  characterId: number
): Promise<OfflineReport | null> {
  const char = await loadCharacter(characterId);
  if (!char) return null;

  if (!char.location.startsWith('field:')) return null;
  const fieldId = parseInt(char.location.slice(6), 10);
  if (Number.isNaN(fieldId)) return null;

  // 1계정당 하루 최대 2캐릭터까지만 방치보상 적용
  // (24시간 내 방치보상 수령한 캐릭터가 이미 2명 이상이고 본인이 거기 포함 안 되면 스킵)
  {
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

  // 전투 세션이 활성이면 온라인 전투 중 → 방치보상 없음
  const activeSession = await query(
    'SELECT 1 FROM combat_sessions WHERE character_id = $1', [characterId]
  );
  if (activeSession.rowCount && activeSession.rowCount > 0) {
    await query('UPDATE characters SET last_online_at = NOW() WHERE id = $1', [characterId]);
    return null;
  }

  const lastOnline = new Date(char.last_online_at);
  const now = new Date();
  const elapsedSec = (now.getTime() - lastOnline.getTime()) / 1000;
  if (elapsedSec < MIN_OFFLINE_SECONDS) return null;

  const userR = await query<{ premium_until: string | null }>('SELECT premium_until FROM users WHERE id = $1', [char.user_id]);
  const isPremium = !!userR.rows[0]?.premium_until && new Date(userR.rows[0].premium_until) > now;
  const efficiency = isPremium ? PREMIUM_EFFICIENCY : DEFAULT_EFFICIENCY;

  const cappedSec = Math.min(elapsedSec, MAX_OFFLINE_SECONDS);
  const effectiveSec = cappedSec * efficiency;

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

  // 플레이어 스탯 + 스킬 (온라인과 동일 — 유저 설정 스킬 + 슬롯 순서)
  const pEff = await getEffectiveStats(char);
  const skillsR = await query<SkillDef & { kind: string; slot_order: number }>(
    `SELECT s.id, s.name, s.damage_mult, s.cooldown_actions, s.flat_damage, s.effect_type, s.effect_value,
            s.kind, COALESCE(cs.slot_order, 9999) AS slot_order
     FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
     WHERE cs.character_id = $1 AND cs.auto_use = TRUE AND s.required_level <= $2
     ORDER BY cs.slot_order ASC, s.required_level ASC`,
    [characterId, char.level]
  );
  const skills = skillsR.rows;
  const useMatk = pEff.matk > pEff.atk;

  // 몬스터 평균 effective stats 계산 (온라인 엔진과 동일 공식)
  const avgMonsterStats: EffectiveStats = {
    str: avg(monsters.map(m => m.stats.str)),
    dex: avg(monsters.map(m => m.stats.dex)),
    int: avg(monsters.map(m => m.stats.int)),
    vit: avg(monsters.map(m => m.stats.vit)),
    spd: avg(monsters.map(m => m.stats.spd)),
    cri: avg(monsters.map(m => m.stats.cri)),
    maxHp: avg(monsters.map(m => m.max_hp)),
    atk: avg(monsters.map(m => m.stats.str)),
    matk: avg(monsters.map(m => m.stats.int * 1.2)),
    def: avg(monsters.map(m => m.stats.vit * 0.8)),
    mdef: avg(monsters.map(m => m.stats.int * 0.5)),
    dodge: avg(monsters.map(m => m.stats.dex * 0.2)),
    accuracy: avg(monsters.map(m => 80 + m.stats.dex * 0.3)),
  };

  // ── 전투 시뮬레이션 (온라인 autoAction과 동일 로직) ──
  const avgMonsterHp = avg(monsters.map(m => m.max_hp));
  const avgMonsterSpd = Math.max(10, avg(monsters.map(m => m.stats.spd)));

  // 한 마리 킬타임 시뮬레이션
  let simMonsterHp = avgMonsterHp;
  let simPlayerHp = pEff.maxHp;
  let playerGauge = 0;
  let monsterGauge = 0;
  let simTime = 0;
  let simActions = 0;
  const cooldowns = new Map<number, number>();

  while (simMonsterHp > 0 && simPlayerHp > 0 && simTime < 300) {
    // 게이지 충전 (온라인 엔진과 동일)
    playerGauge += pEff.spd * GAUGE_FILL_RATE;
    monsterGauge += avgMonsterSpd * GAUGE_FILL_RATE;
    simTime += TICK_SEC;

    // 플레이어 행동
    if (playerGauge >= GAUGE_MAX) {
      playerGauge = 0;
      simActions++;

      // 쿨다운 감소
      for (const [skId, cd] of cooldowns) {
        if (cd <= 1) cooldowns.delete(skId);
        else cooldowns.set(skId, cd - 1);
      }

      // 1단계: 버프 자유 행동 (kind='buff', 슬롯 순서대로)
      const sorted = [...skills].sort((a: any, b: any) => a.slot_order - b.slot_order);
      for (const sk of sorted) {
        if ((sk as any).kind !== 'buff') continue;
        if (sk.cooldown_actions > 0 && cooldowns.has(sk.id)) continue;
        // 버프 효과는 시뮬에서 직접 스탯 수정하기 어려우므로 쿨다운만 설정
        if (sk.cooldown_actions > 0) cooldowns.set(sk.id, sk.cooldown_actions);
      }

      // 2단계: 메인 딜 스킬 (슬롯 순서대로 첫 번째 사용 가능)
      let bestSkill: SkillDef | null = null;
      for (const sk of sorted) {
        if ((sk as any).kind === 'buff') continue;
        if (sk.cooldown_actions > 0 && cooldowns.has(sk.id)) continue;
        bestSkill = sk;
        break;
      }

      if (bestSkill) {
        const d = calcDamage(pEff, avgMonsterStats, bestSkill.damage_mult, useMatk, bestSkill.flat_damage);
        if (!d.miss) {
          simMonsterHp -= d.damage;
        }
        if (bestSkill.cooldown_actions > 0) {
          cooldowns.set(bestSkill.id, bestSkill.cooldown_actions);
        }
      }
    }

    // 몬스터 행동
    if (monsterGauge >= GAUGE_MAX) {
      monsterGauge = 0;
      const d = calcDamage(avgMonsterStats, pEff, 1.0, false);
      if (!d.miss) {
        simPlayerHp -= d.damage;
      }
    }
  }

  const simKillTimeSec = simTime;
  const dangerous = simPlayerHp <= 0;

  // 실제 최근 평균 킬타임 (DB 저장, 온라인 전투 중 10킬마다 갱신)
  //   → 시뮬 결과보다 실제 전투 속도를 우선 사용 (더 정확한 보상)
  const realAvgR = await query<{ recent_avg_kill_time_sec: string | null }>(
    'SELECT recent_avg_kill_time_sec FROM characters WHERE id = $1', [characterId]
  );
  const realAvg = realAvgR.rows[0]?.recent_avg_kill_time_sec ? Number(realAvgR.rows[0].recent_avg_kill_time_sec) : null;
  // 실제값이 있으면 그걸 사용, 없으면 시뮬 결과 (최소 0.5초 보장)
  const killTimeSec = (realAvg && realAvg > 0.5 && realAvg < 300) ? realAvg : simKillTimeSec;

  // 킬 수 계산
  let killCount: number;
  if (dangerous && !realAvg) {
    // 시뮬에서 플레이어 사망 + 실제값 없음 → 50마리 상한
    killCount = Math.min(50, Math.floor(effectiveSec / Math.max(1, killTimeSec)));
  } else {
    killCount = Math.floor(effectiveSec / Math.max(0.5, killTimeSec));
  }

  // 보상 계산 + 글로벌 이벤트 배율 + 길드/접두사/부스터 — 온라인 사냥과 동일하게 적용
  const { getActiveGlobalEvent } = await import('../game/globalEvent.js');
  const { getGuildSkillsForCharacter, GUILD_SKILL_PCT } = await import('../game/guild.js');
  const ge = await getActiveGlobalEvent();
  const guildSkills = await getGuildSkillsForCharacter(characterId);
  const guildExpBonus = guildSkills.exp * GUILD_SKILL_PCT.exp;
  const guildGoldBonus = guildSkills.gold * GUILD_SKILL_PCT.gold;
  // 장착 접두사 (exp_bonus_pct, gold_bonus_pct)
  const prefR = await query<{ prefix_stats: Record<string, number> | null; enhance_level: number }>(
    `SELECT prefix_stats, enhance_level FROM character_equipped WHERE character_id = $1`, [characterId]
  );
  let expBonusPct = 0;
  let goldBonusPct = 0;
  for (const row of prefR.rows) {
    if (!row.prefix_stats) continue;
    const mult = 1 + (row.enhance_level || 0) * 0.05;
    if (row.prefix_stats.exp_bonus_pct) expBonusPct += Math.round(row.prefix_stats.exp_bonus_pct * mult);
    if (row.prefix_stats.gold_bonus_pct) goldBonusPct += Math.round(row.prefix_stats.gold_bonus_pct * mult);
  }
  const boostR = await query<{ gold_boost_until: string | null; drop_boost_until: string | null }>(
    'SELECT gold_boost_until, drop_boost_until FROM characters WHERE id = $1', [characterId]
  );
  const goldBoostActive = boostR.rows[0]?.gold_boost_until && new Date(boostR.rows[0].gold_boost_until) > now;
  const dropBoostActive = !!(boostR.rows[0]?.drop_boost_until && new Date(boostR.rows[0].drop_boost_until) > now);
  const avgExp = avg(monsters.map(m => m.exp_reward));
  const avgGold = avg(monsters.map(m => m.gold_reward));
  const boostActive = char.exp_boost_until && new Date(char.exp_boost_until) > now;
  const boostMult = boostActive ? 1.5 : 1.0;
  // 레벨차 페널티 (필드 평균 몬스터 레벨 기준)
  const { computeLevelDiffExpMult } = await import('../combat/engine.js');
  const avgMonsterLevel = Math.round(avg(monsters.map(m => m.level)));
  const levelDiffMult = computeLevelDiffExpMult(char.level, avgMonsterLevel);
  const expGained = Math.floor(killCount * avgExp * boostMult * (1 + expBonusPct / 100) * (1 + guildExpBonus / 100) * ge.exp * levelDiffMult);
  const goldGained = Math.floor(killCount * avgGold * (goldBoostActive ? 1.5 : 1.0) * (1 + goldBonusPct / 100) * (1 + guildGoldBonus / 100) * ge.gold);

  // 드랍 보너스 — 온라인 전투와 동일하게 적용
  // 드랍부스터 / 길드 / 영토 / 접두사 drop_rate_pct
  const DROP_RATE_MULT = 0.1; // engine.ts 와 동일 (유니크 제외)
  const { getTerritoryBonusForChar } = await import('../game/territory.js');
  const guildDropBonus = guildSkills.drop * GUILD_SKILL_PCT.drop;
  let territoryDropPct = 0;
  try {
    const tb = await getTerritoryBonusForChar(characterId, fieldId);
    territoryDropPct = tb?.dropPct || 0;
  } catch { /* ignore */ }
  let prefixDropBonus = 0;
  for (const row of prefR.rows) {
    if (!row.prefix_stats) continue;
    const mult = 1 + (row.enhance_level || 0) * 0.05;
    if (row.prefix_stats.drop_rate_pct) prefixDropBonus += Math.round(row.prefix_stats.drop_rate_pct * mult);
  }
  const dropBoostMult = dropBoostActive ? 1.5 : 1.0;
  const dropBonusMult = 1 + (guildDropBonus + territoryDropPct + prefixDropBonus) / 100;

  // 몬스터 드랍 아이템의 grade 미리 조회 (유니크는 DROP_RATE_MULT 제외)
  const allDropItemIds = [...new Set(monsters.flatMap(m => (m.drop_table || []).map(d => d.itemId)))];
  const itemInfo = new Map<number, { name: string; grade: string; sell_price: number; slot: string | null }>();
  if (allDropItemIds.length > 0) {
    const ir = await query<{ id: number; name: string; grade: string; sell_price: number; slot: string | null }>(
      `SELECT id, name, grade, sell_price, slot FROM items WHERE id = ANY($1::int[])`, [allDropItemIds]
    );
    for (const r of ir.rows) itemInfo.set(r.id, { name: r.name, grade: r.grade, sell_price: r.sell_price, slot: r.slot });
  }

  // 드랍 계산
  // 방치보상은 기대값 기반(deterministic)이라 온라인의 확률 롤링과 달리
  // 유니크도 DROP_RATE_MULT 를 적용해 기대값을 축소 — 그렇지 않으면 킬 수 많을 때
  // 유니크가 확정적으로 다수 지급되는 비정상 현상 발생 (online은 확률 roll이라 운에 맡겨짐)
  const drops: Record<number, number> = {};
  for (const m of monsters) {
    for (const d of m.drop_table || []) {
      const expectedKills = killCount / monsters.length;
      const effectiveChance = d.chance * DROP_RATE_MULT * dropBoostMult * dropBonusMult * ge.drop;
      const expectedQty = expectedKills * effectiveChance * ((d.minQty + d.maxQty) / 2);
      const qty = Math.floor(expectedQty);
      if (qty > 0) drops[d.itemId] = (drops[d.itemId] || 0) + qty;
    }
  }

  // 유저의 자동판매 / 드랍필터 설정 로드 (온라인과 동일 적용)
  const filterR = await query<{
    auto_dismantle_tiers: number;
    drop_filter_tiers: number;
    drop_filter_common: boolean;
  }>(
    `SELECT COALESCE(auto_dismantle_tiers, 0) AS auto_dismantle_tiers,
            COALESCE(drop_filter_tiers, 0) AS drop_filter_tiers,
            COALESCE(drop_filter_common, FALSE) AS drop_filter_common
     FROM characters WHERE id = $1`, [characterId]
  );
  const fConf = filterR.rows[0] || { auto_dismantle_tiers: 0, drop_filter_tiers: 0, drop_filter_common: false };
  const autoSellEnabled = fConf.auto_dismantle_tiers > 0;
  const dropFilterEnabled = fConf.drop_filter_tiers > 0 || fConf.drop_filter_common;

  // 적용
  const levelUp = applyExpGain(char.level, char.exp, expGained, char.class_name);
  let overflow = 0;
  let autoSoldGold = 0;
  let filteredSkipped = 0;
  const itemDropList: { itemId: number; name: string; quantity: number; grade: string }[] = [];

  for (const [itemIdStr, qty] of Object.entries(drops)) {
    const itemId = parseInt(itemIdStr, 10);
    const info = itemInfo.get(itemId);
    if (!info) continue;

    // 드랍필터: common 등급 + 비장비 아이템은 드랍필터 common 설정 시 스킵
    //   (온라인과 완전 일치는 아니지만 가장 영향 큰 junk 를 차단)
    if (dropFilterEnabled && fConf.drop_filter_common && info.grade === 'common') {
      filteredSkipped += qty;
      continue;
    }

    // 자동판매: common/uncommon 등급을 골드로 변환
    //   (온라인은 tier 기반이지만 offline 은 접두사 rolling 안 해서 grade 로 근사)
    if (autoSellEnabled && (info.grade === 'common' || info.grade === 'uncommon') && info.slot) {
      autoSoldGold += Math.max(1, Math.floor(info.sell_price * 0.5)) * qty;
      continue;
    }

    const { overflow: ov } = await addItemToInventory(characterId, itemId, qty);
    if (ov > 0) overflow += ov;
    itemDropList.push({ itemId, name: info.name, quantity: qty, grade: info.grade });
  }

  // 자동판매 골드 goldGained 에 합산
  const totalGoldGained = goldGained + autoSoldGold;

  // 캐릭터 업데이트 (자동판매 골드 포함)
  if (levelUp.levelsGained > 0) {
    await query(
      `UPDATE characters
       SET level=$1, exp=$2, gold=gold+$3,
           max_hp=max_hp+$4, hp=max_hp+$4,
           node_points=node_points+$5,
           stat_points=COALESCE(stat_points,0)+$7,
           last_online_at=NOW()
       WHERE id=$6`,
      [levelUp.newLevel, levelUp.newExp, totalGoldGained,
       levelUp.hpGained, levelUp.nodePointsGained, characterId,
       levelUp.statPointsGained]
    );
  } else {
    await query(
      'UPDATE characters SET exp=$1, gold=gold+$2, last_online_at=NOW() WHERE id=$3',
      [levelUp.newExp, totalGoldGained, characterId]
    );
  }

  if (dangerous) {
    await query('UPDATE characters SET location=$1 WHERE id=$2', ['village', characterId]);
    await query('DELETE FROM combat_sessions WHERE character_id=$1', [characterId]);
  }

  const report: OfflineReport = {
    minutesAccounted: Math.floor(cappedSec / 60),
    efficiency,
    killCount,
    expGained,
    goldGained: totalGoldGained,
    itemsDropped: itemDropList,
    levelsGained: levelUp.levelsGained,
    overflow,
  };
  if (filteredSkipped > 0) console.log(`[offline] char ${characterId} filtered ${filteredSkipped} common drops`);
  if (autoSoldGold > 0) console.log(`[offline] char ${characterId} auto-sold common/uncommon → +${autoSoldGold}G`);

  await query(
    `INSERT INTO offline_reports
     (character_id, minutes_accounted, efficiency, kill_count, exp_gained, gold_gained, items_dropped, levels_gained, overflow, delivered)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE)`,
    [characterId, report.minutesAccounted, report.efficiency, report.killCount,
     report.expGained, report.goldGained, JSON.stringify(report.itemsDropped),
     report.levelsGained, report.overflow]
  );

  return report;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
