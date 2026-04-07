// 오프라인 진행 보상 통계 정산 — v0.9 게이지 기반
import { query } from '../db/pool.js';
import { applyExpGain } from '../game/leveling.js';
import { addItemToInventory, deliverToMailbox } from '../game/inventory.js';
import { loadCharacter, getEffectiveStats } from '../game/character.js';

const MAX_OFFLINE_SECONDS = 24 * 3600;
const DEFAULT_EFFICIENCY = 0.9;
const PREMIUM_EFFICIENCY = 1.0;
const GAUGE_MAX = 1000;

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

  const lastOnline = new Date(char.last_online_at);
  const now = new Date();
  const elapsedSec = (now.getTime() - lastOnline.getTime()) / 1000;
  if (elapsedSec < 60) return null;

  const userR = await query<{ premium_until: string | null }>('SELECT premium_until FROM users WHERE id = $1', [char.user_id]);
  const isPremium = !!userR.rows[0]?.premium_until && new Date(userR.rows[0].premium_until) > now;
  const efficiency = isPremium ? PREMIUM_EFFICIENCY : DEFAULT_EFFICIENCY;

  const cappedSec = Math.min(elapsedSec, MAX_OFFLINE_SECONDS);
  const effectiveSec = cappedSec * efficiency;

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

  const pEff = await getEffectiveStats(char);

  // 게이지 기반 킬타임 계산
  // 플레이어 행동 주기: GAUGE_MAX / playerSpeed 틱 × 0.1초
  const playerActionInterval = (GAUGE_MAX / pEff.spd) * 0.1; // 초
  const playerDamagePerAction = Math.max(1, pEff.atk - avg(monsters.map(m => m.stats.vit * 0.8)) * 0.5);
  const avgMonsterHp = avg(monsters.map(m => m.max_hp));
  const actionsToKill = Math.max(1, avgMonsterHp / playerDamagePerAction);
  const effectiveKillTime = actionsToKill * playerActionInterval;

  // 위험도 체크: 몬스터 DPS vs 플레이어 HP
  const avgMonsterSpd = avg(monsters.map(m => m.stats.spd));
  const monsterActionInterval = (GAUGE_MAX / Math.max(10, avgMonsterSpd)) * 0.1;
  const avgMonsterAtk = avg(monsters.map(m => m.stats.str));
  const monsterDmgPerAction = Math.max(1, avgMonsterAtk - pEff.def * 0.5);
  const monsterDps = monsterDmgPerAction / monsterActionInterval;
  const playerDps = playerDamagePerAction / playerActionInterval;
  const dangerous = playerDps * 2 < monsterDps;

  let killCount = Math.floor(effectiveSec / effectiveKillTime);
  if (dangerous) killCount = Math.min(killCount, 50);

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
  const levelUp = applyExpGain(char.level, char.exp, expGained);
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

  // 캐릭터 업데이트 — v0.9: 스탯 성장 없음, 노드 포인트 + maxHp만
  if (levelUp.levelsGained > 0) {
    await query(
      `UPDATE characters
       SET level=$1, exp=$2, gold=gold+$3,
           max_hp=max_hp+$4, hp=max_hp+$4,
           node_points=node_points+$5,
           last_online_at=NOW()
       WHERE id=$6`,
      [levelUp.newLevel, levelUp.newExp, goldGained,
       levelUp.hpGained, levelUp.nodePointsGained, characterId]
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
