// 오프라인 진행 보상 — 온라인 전투와 동일 구조 시뮬레이션
import { query } from '../db/pool.js';
import { applyExpGain } from '../game/leveling.js';
import { addItemToInventory, deliverToMailbox } from '../game/inventory.js';
import { loadCharacter, getEffectiveStats } from '../game/character.js';
import { calcDamage, type EffectiveStats } from '../game/formulas.js';

const MAX_OFFLINE_SECONDS = 24 * 3600;
const MIN_OFFLINE_SECONDS = 300; // 최소 5분
const DEFAULT_EFFICIENCY = 0.9;
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

  // 플레이어 스탯 + 스킬 (온라인과 동일)
  const pEff = await getEffectiveStats(char);
  const skillsR = await query<SkillDef>(
    `SELECT id, name, damage_mult, cooldown_actions, flat_damage, effect_type, effect_value
     FROM skills WHERE class_name = $1 AND required_level <= $2
     ORDER BY damage_mult DESC`,
    [char.class_name, char.level]
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

      // autoAction 로직: 가장 강한 스킬 사용 (온라인과 동일)
      let bestSkill = skills.find(sk => sk.cooldown_actions === 0); // 기본기 폴백
      const nonBasic = skills.find(sk => {
        if (sk.cooldown_actions === 0) return false;
        const cd = cooldowns.get(sk.id);
        return !cd || cd <= 0;
      });
      if (nonBasic) bestSkill = nonBasic;

      if (bestSkill) {
        // 데미지 계산 (온라인 calcDamage와 동일)
        const d = calcDamage(pEff, avgMonsterStats, bestSkill.damage_mult, useMatk, bestSkill.flat_damage);
        if (!d.miss) {
          simMonsterHp -= d.damage;
        }
        // 쿨다운 설정
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

  const killTimeSec = simTime;
  const dangerous = simPlayerHp <= 0;

  // 킬 수 계산
  let killCount: number;
  if (dangerous) {
    // 플레이어가 죽으면 50마리 상한
    killCount = Math.min(50, Math.floor(effectiveSec / Math.max(1, killTimeSec)));
  } else {
    killCount = Math.floor(effectiveSec / Math.max(0.5, killTimeSec));
  }

  // 보상 계산
  const avgExp = avg(monsters.map(m => m.exp_reward));
  const avgGold = avg(monsters.map(m => m.gold_reward));
  const boostActive = char.exp_boost_until && new Date(char.exp_boost_until) > now;
  const boostMult = boostActive ? 1.5 : 1.0;
  const expGained = Math.floor(killCount * avgExp * boostMult);
  const goldGained = Math.floor(killCount * avgGold);

  // 드랍 계산
  const drops: Record<number, number> = {};
  for (const m of monsters) {
    for (const d of m.drop_table || []) {
      const expectedKills = killCount / monsters.length;
      const expectedQty = expectedKills * d.chance * ((d.minQty + d.maxQty) / 2);
      const qty = Math.floor(expectedQty);
      if (qty > 0) drops[d.itemId] = (drops[d.itemId] || 0) + qty;
    }
  }

  // 적용
  const levelUp = applyExpGain(char.level, char.exp, expGained, char.class_name);
  let overflow = 0;
  const itemDropList: { itemId: number; name: string; quantity: number; grade: string }[] = [];

  for (const [itemIdStr, qty] of Object.entries(drops)) {
    const itemId = parseInt(itemIdStr, 10);
    const { overflow: ov } = await addItemToInventory(characterId, itemId, qty);
    if (ov > 0) {
      overflow += ov;
      await deliverToMailbox(characterId, '오프라인 획득 초과분', '가방이 가득 차서 우편으로 배송', itemId, ov);
    }
    const itemR = await query<{ name: string; grade: string }>('SELECT name, grade FROM items WHERE id = $1', [itemId]);
    if (itemR.rowCount && itemR.rowCount > 0) {
      itemDropList.push({ itemId, name: itemR.rows[0].name, quantity: qty, grade: itemR.rows[0].grade });
    }
  }

  // 캐릭터 업데이트
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

  if (dangerous) {
    await query('UPDATE characters SET location=$1 WHERE id=$2', ['village', characterId]);
    await query('DELETE FROM combat_sessions WHERE character_id=$1', [characterId]);
  }

  const report: OfflineReport = {
    minutesAccounted: Math.floor(cappedSec / 60),
    efficiency,
    killCount,
    expGained,
    goldGained,
    itemsDropped: itemDropList,
    levelsGained: levelUp.levelsGained,
    overflow,
  };

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
