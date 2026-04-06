// 오프라인 진행 보상 통계 정산
import { query } from '../db/pool.js';
import { applyExpGain } from '../game/leveling.js';
import { addItemToInventory, deliverToMailbox } from '../game/inventory.js';
import { loadCharacter, getEffectiveStats } from '../game/character.js';

const MAX_OFFLINE_SECONDS = 24 * 3600;
const DEFAULT_EFFICIENCY = 0.9;
const PREMIUM_EFFICIENCY = 1.0;

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

  // 필드에 있지 않으면 오프라인 보상 없음
  if (!char.location.startsWith('field:')) return null;
  const fieldId = parseInt(char.location.slice(6), 10);
  if (Number.isNaN(fieldId)) return null;

  const lastOnline = new Date(char.last_online_at);
  const now = new Date();
  const elapsedSec = (now.getTime() - lastOnline.getTime()) / 1000;
  if (elapsedSec < 60) return null; // 1분 미만은 스킵

  // 프리미엄 체크
  const userR = await query<{ premium_until: string | null }>('SELECT premium_until FROM users WHERE id = $1', [char.user_id]);
  const isPremium = !!userR.rows[0]?.premium_until && new Date(userR.rows[0].premium_until) > now;
  const efficiency = isPremium ? PREMIUM_EFFICIENCY : DEFAULT_EFFICIENCY;

  const cappedSec = Math.min(elapsedSec, MAX_OFFLINE_SECONDS);
  const effectiveSec = cappedSec * efficiency;

  // 필드 및 몬스터 로드
  const fr = await query<{ monster_pool: number[] }>('SELECT monster_pool FROM fields WHERE id = $1', [fieldId]);
  if (fr.rowCount === 0) return null;
  const pool = fr.rows[0].monster_pool;

  const mr = await query<{
    id: number; name: string; level: number; max_hp: number;
    exp_reward: number; gold_reward: number;
    stats: { str: number; dex: number; int: number; vit: number; spd: number; cri: number };
    drop_table: { itemId: number; chance: number; minQty: number; maxQty: number }[];
    avg_kill_time_sec: number;
  }>('SELECT id, name, level, max_hp, exp_reward, gold_reward, stats, drop_table, avg_kill_time_sec FROM monsters WHERE id = ANY($1::int[])', [pool]);
  if (mr.rowCount === 0) return null;
  const monsters = mr.rows;

  // 자동 회피: 캐릭터 DPS × 2 < 몬스터 평균 DPS 이면 보상 중단
  const pEff = await getEffectiveStats(char);
  const playerDps = pEff.atk * (1000 / pEff.tickMs);
  const avgMonsterAtk = avg(monsters.map(m => m.stats.str));
  const avgMonsterSpd = avg(monsters.map(m => m.stats.spd));
  const avgMonsterTickMs = Math.max(500, Math.min(5000, 2000 / (avgMonsterSpd / 100)));
  const monsterDps = avgMonsterAtk * (1000 / avgMonsterTickMs);
  const dangerous = playerDps * 2 < monsterDps;

  // 평균 킬타임 (DPS 보정)
  const avgKillSec = avg(monsters.map(m => m.avg_kill_time_sec));
  const killSpeedMult = Math.max(0.5, pEff.atk / 30);
  const effectiveKillTime = avgKillSec / killSpeedMult;

  let killCount = Math.floor(effectiveSec / effectiveKillTime);
  if (dangerous) killCount = Math.min(killCount, 50); // 위험 시 제한

  const avgExp = avg(monsters.map(m => m.exp_reward));
  const avgGold = avg(monsters.map(m => m.gold_reward));
  const boostActive = char.exp_boost_until && new Date(char.exp_boost_until) > now;
  const boostMult = boostActive ? 1.5 : 1.0;
  const expGained = Math.floor(killCount * avgExp * boostMult);
  const goldGained = Math.floor(killCount * avgGold);

  // 드랍 계산 (기댓값)
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
  const levelUp = applyExpGain(char.class_name, char.level, char.exp, expGained);
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
    const g = levelUp.statGains;
    await query(
      `UPDATE characters
       SET level=$1, exp=$2, gold=gold+$3,
           stats=jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(stats,
             '{str}', to_jsonb((stats->>'str')::numeric + $4)),
             '{dex}', to_jsonb((stats->>'dex')::numeric + $5)),
             '{int}', to_jsonb((stats->>'int')::numeric + $6)),
             '{vit}', to_jsonb((stats->>'vit')::numeric + $7)),
             '{spd}', to_jsonb((stats->>'spd')::numeric + $8)),
             '{cri}', to_jsonb((stats->>'cri')::numeric + $9)),
           max_hp=max_hp+$10, max_mp=max_mp+$11,
           hp=max_hp+$10, mp=max_mp+$11,
           last_online_at=NOW()
       WHERE id=$12`,
      [levelUp.newLevel, levelUp.newExp, goldGained,
       g.str, g.dex, g.int, g.vit, g.spd, g.cri, g.hp, g.mp, characterId]
    );
  } else {
    await query(
      'UPDATE characters SET exp=$1, gold=gold+$2, last_online_at=NOW() WHERE id=$3',
      [levelUp.newExp, goldGained, characterId]
    );
  }

  // 위험한 경우 마을로 복귀
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
