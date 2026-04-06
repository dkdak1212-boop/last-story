// 전투 틱 처리 엔진
import { query } from '../db/pool.js';
import { calcDamage, type EffectiveStats } from '../game/formulas.js';
import { applyExpGain } from '../game/leveling.js';
import { loadCharacter, getEffectiveStats } from '../game/character.js';
import { addItemToInventory, deliverToMailbox } from '../game/inventory.js';
import { trackMonsterKill } from '../routes/quests.js';
import type { Stats } from '../game/classes.js';

interface SessionRow {
  character_id: number;
  field_id: number;
  monster_id: number | null;
  monster_hp: number;
  monster_max_hp: number;
  monster_stats: EffectiveStats | Record<string, unknown>;
  player_hp: number;
  player_mp: number;
  player_stats: EffectiveStats | Record<string, unknown>;
  skill_cooldowns: Record<string, string>;
  log: string[];
  next_player_action_at: string;
  next_monster_action_at: string;
}

interface MonsterDef {
  id: number;
  name: string;
  level: number;
  max_hp: number;
  exp_reward: number;
  gold_reward: number;
  stats: Stats;
  drop_table: { itemId: number; chance: number; minQty: number; maxQty: number }[];
}

interface SkillDef {
  id: number;
  name: string;
  cooldown_sec: number;
  mp_cost: number;
  damage_mult: number;
  kind: string;
  target: string;
  required_level: number;
}

const MAX_LOG = 50;

async function pickRandomMonster(fieldId: number): Promise<MonsterDef | null> {
  const fr = await query<{ monster_pool: number[] }>('SELECT monster_pool FROM fields WHERE id = $1', [fieldId]);
  if (fr.rowCount === 0) return null;
  const pool = fr.rows[0].monster_pool;
  if (pool.length === 0) return null;
  const mid = pool[Math.floor(Math.random() * pool.length)];
  const mr = await query<MonsterDef>(
    `SELECT id, name, level, max_hp, exp_reward, gold_reward, stats, drop_table
     FROM monsters WHERE id = $1`,
    [mid]
  );
  return mr.rows[0] || null;
}

function monsterToEffective(m: MonsterDef): EffectiveStats {
  const s = m.stats;
  return {
    str: s.str, dex: s.dex, int: s.int, vit: s.vit, spd: s.spd, cri: s.cri,
    maxHp: m.max_hp, maxMp: 0,
    atk: s.str * 1.0,
    matk: s.int * 1.2,
    def: s.vit * 0.8,
    mdef: s.int * 0.5,
    dodge: s.dex * 0.4,
    accuracy: 80 + s.dex * 0.5,
    tickMs: Math.max(500, Math.min(5000, 2000 / (s.spd / 100))),
  };
}

async function getAutoSkills(characterId: number, level: number): Promise<SkillDef[]> {
  const r = await query<SkillDef>(
    `SELECT s.id, s.name, s.cooldown_sec, s.mp_cost, s.damage_mult, s.kind, s.target, s.required_level
     FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
     WHERE cs.character_id = $1 AND cs.auto_use = TRUE AND s.required_level <= $2
     ORDER BY s.damage_mult DESC`,
    [characterId, level]
  );
  return r.rows;
}

async function getPotionInInventory(characterId: number, itemIds: number[]) {
  const r = await query<{ id: number; item_id: number; quantity: number }>(
    `SELECT id, item_id, quantity FROM character_inventory
     WHERE character_id = $1 AND item_id = ANY($2::int[]) AND quantity > 0
     ORDER BY slot_index ASC LIMIT 1`,
    [characterId, itemIds]
  );
  return r.rows[0] || null;
}

async function consumeOneFromSlot(slotId: number) {
  await query('UPDATE character_inventory SET quantity = quantity - 1 WHERE id = $1', [slotId]);
  await query('DELETE FROM character_inventory WHERE id = $1 AND quantity <= 0', [slotId]);
}

function rollDrops(m: MonsterDef): { itemId: number; qty: number }[] {
  const drops: { itemId: number; qty: number }[] = [];
  for (const d of m.drop_table || []) {
    if (Math.random() < d.chance) {
      const qty = d.minQty + Math.floor(Math.random() * (d.maxQty - d.minQty + 1));
      if (qty > 0) drops.push({ itemId: d.itemId, qty });
    }
  }
  return drops;
}

async function spawnMonster(characterId: number, fieldId: number, now: Date) {
  const m = await pickRandomMonster(fieldId);
  if (!m) return null;
  const monsterStats = monsterToEffective(m);
  await query(
    `UPDATE combat_sessions
     SET monster_id=$1, monster_hp=$2, monster_max_hp=$2, monster_stats=$3,
         next_monster_action_at=$4, updated_at=$5
     WHERE character_id=$6`,
    [m.id, m.max_hp, monsterStats, new Date(now.getTime() + monsterStats.tickMs).toISOString(), now.toISOString(), characterId]
  );
  return { monster: m, stats: monsterStats };
}

export interface CombatState {
  inCombat: boolean;
  fieldName?: string;
  player: { hp: number; maxHp: number; mp: number; maxMp: number };
  monster?: { name: string; hp: number; maxHp: number; level: number };
  log: string[];
  now?: number;
  nextPlayerAt?: number;
  nextMonsterAt?: number;
  playerTickMs?: number;
  monsterTickMs?: number;
  potions?: { hpSmall: number; hpMid: number; mpSmall: number; mpMid: number };
}

async function countPotions(characterId: number) {
  const r = await query<{ item_id: number; total: string }>(
    `SELECT item_id, SUM(quantity)::text AS total FROM character_inventory
     WHERE character_id = $1 AND item_id IN (100,101,102,103) GROUP BY item_id`,
    [characterId]
  );
  const counts = { hpSmall: 0, hpMid: 0, mpSmall: 0, mpMid: 0 };
  for (const row of r.rows) {
    const n = Number(row.total);
    if (row.item_id === 100) counts.hpSmall = n;
    else if (row.item_id === 102) counts.hpMid = n;
    else if (row.item_id === 101) counts.mpSmall = n;
    else if (row.item_id === 103) counts.mpMid = n;
  }
  return counts;
}

export async function processCombatTick(characterId: number): Promise<CombatState> {
  const char = await loadCharacter(characterId);
  if (!char) throw new Error('character not found');

  if (!char.location.startsWith('field:')) {
    return {
      inCombat: false,
      player: { hp: char.hp, maxHp: char.max_hp, mp: char.mp, maxMp: char.max_mp },
      log: [],
    };
  }

  // 세션 로드
  const sr = await query<SessionRow>('SELECT * FROM combat_sessions WHERE character_id = $1', [characterId]);
  if (sr.rowCount === 0) {
    return {
      inCombat: false,
      player: { hp: char.hp, maxHp: char.max_hp, mp: char.mp, maxMp: char.max_mp },
      log: [],
    };
  }
  const session = sr.rows[0];
  const fr = await query<{ name: string }>('SELECT name FROM fields WHERE id = $1', [session.field_id]);
  const fieldName = fr.rows[0]?.name;

  const now = new Date();
  let pStats = session.player_stats as EffectiveStats;
  // 빈 경우(오래된 세션) 재계산
  if (!pStats.atk) pStats = await getEffectiveStats(char);

  let mStats = session.monster_stats as EffectiveStats;
  let playerHp = session.player_hp;
  let playerMp = session.player_mp;
  let monsterHp = session.monster_hp;
  let currentMonsterId = session.monster_id;
  let currentMonsterMaxHp = session.monster_max_hp;
  const log = [...session.log];
  const cooldowns: Record<string, string> = session.skill_cooldowns || {};
  let nextPlayerAt = new Date(session.next_player_action_at);
  let nextMonsterAt = new Date(session.next_monster_action_at);

  // 적 없으면 스폰
  if (!session.monster_id || monsterHp <= 0) {
    const spawn = await spawnMonster(characterId, session.field_id, now);
    if (!spawn) {
      return {
        inCombat: true, fieldName,
        player: { hp: playerHp, maxHp: char.max_hp, mp: playerMp, maxMp: char.max_mp },
        log,
      };
    }
    mStats = spawn.stats;
    monsterHp = spawn.monster.max_hp;
    currentMonsterId = spawn.monster.id;
    currentMonsterMaxHp = spawn.monster.max_hp;
    nextMonsterAt = new Date(now.getTime() + spawn.stats.tickMs);
    log.push(`${spawn.monster.name}이(가) 나타났다!`);
  }

  const MAX_ITERATIONS = 30;
  let iter = 0;

  // 플레이어/몬스터 행동 루프
  while (iter++ < MAX_ITERATIONS) {
    const pReady = nextPlayerAt.getTime() <= now.getTime();
    const mReady = nextMonsterAt.getTime() <= now.getTime();
    if (!pReady && !mReady) break;

    // 이른 쪽 먼저
    const playerFirst = pReady && (!mReady || nextPlayerAt.getTime() <= nextMonsterAt.getTime());

    if (playerFirst) {
      // === 플레이어 행동 ===
      let actionTaken = false;

      // 1. 자동 포션 (캐릭터 설정값 기반)
      const ps = char.potion_settings || { hpEnabled: true, hpThreshold: 40, mpEnabled: true, mpThreshold: 30 };
      if (ps.hpEnabled && playerHp / char.max_hp * 100 < ps.hpThreshold) {
        const pot = await getPotionInInventory(characterId, [102, 100]); // 중급 우선
        if (pot) {
          const heal = pot.item_id === 102 ? 150 : 50;
          playerHp = Math.min(char.max_hp, playerHp + heal);
          await consumeOneFromSlot(pot.id);
          log.push(`체력 물약 사용 — HP +${heal}`);
          actionTaken = true;
        }
      }
      if (!actionTaken && ps.mpEnabled && playerMp / char.max_mp * 100 < ps.mpThreshold) {
        const pot = await getPotionInInventory(characterId, [103, 101]);
        if (pot) {
          const heal = pot.item_id === 103 ? 100 : 30;
          playerMp = Math.min(char.max_mp, playerMp + heal);
          await consumeOneFromSlot(pot.id);
          log.push(`마나 물약 사용 — MP +${heal}`);
          actionTaken = true;
        }
      }

      // 2. 자동 스킬
      if (!actionTaken) {
        const skills = await getAutoSkills(characterId, char.level);
        for (const sk of skills) {
          const cdEnd = cooldowns[sk.id];
          if (cdEnd && new Date(cdEnd).getTime() > now.getTime()) continue;
          if (playerMp < sk.mp_cost) continue;
          if (sk.kind !== 'damage' && sk.kind !== 'heal') continue; // v0.1 지원 범위

          if (sk.kind === 'heal') {
            const heal = Math.round(pStats.matk * sk.damage_mult);
            playerHp = Math.min(char.max_hp, playerHp + heal);
            log.push(`[${sk.name}] 자신 HP +${heal}`);
          } else {
            const mageClass = ['mage', 'priest', 'druid'].includes(char.class_name);
            const d = calcDamage(pStats, mStats, sk.damage_mult, mageClass);
            if (d.miss) log.push(`[${sk.name}] 빗나감!`);
            else {
              monsterHp -= d.damage;
              log.push(`[${sk.name}] ${d.damage} 데미지${d.crit ? ' (치명타!)' : ''}`);
            }
          }
          playerMp -= sk.mp_cost;
          cooldowns[sk.id] = new Date(now.getTime() + sk.cooldown_sec * 1000).toISOString();
          actionTaken = true;
          break;
        }
      }

      // 3. 기본 공격
      if (!actionTaken) {
        const d = calcDamage(pStats, mStats, 1.0, false);
        if (d.miss) log.push('기본 공격 빗나감!');
        else {
          monsterHp -= d.damage;
          log.push(`${d.damage} 데미지${d.crit ? ' (치명타!)' : ''}`);
        }
      }

      nextPlayerAt = new Date(nextPlayerAt.getTime() + pStats.tickMs);

      // 몬스터 처치
      if (monsterHp <= 0) {
        const mr = await query<{ name: string; exp_reward: number; gold_reward: number; drop_table: { itemId: number; chance: number; minQty: number; maxQty: number }[] }>(
          'SELECT name, exp_reward, gold_reward, drop_table FROM monsters WHERE id = $1',
          [currentMonsterId]
        );
        const m = mr.rows[0];
        log.push(`${m.name}을(를) 처치! +${m.exp_reward} exp, +${m.gold_reward}G`);

        // 경험치/골드 (부스터 적용)
        const boostActive = char.exp_boost_until && new Date(char.exp_boost_until) > new Date();
        const boostedExp = boostActive ? Math.floor(m.exp_reward * 1.5) : m.exp_reward;
        const result = applyExpGain(char.class_name, char.level, char.exp, boostedExp);
        if (result.levelsGained > 0) {
          log.push(`레벨업! Lv.${result.newLevel}`);
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
                 hp=max_hp+$10, mp=max_mp+$11
             WHERE id=$12`,
            [result.newLevel, result.newExp, m.gold_reward,
             result.statGains.str, result.statGains.dex, result.statGains.int,
             result.statGains.vit, result.statGains.spd, result.statGains.cri,
             result.statGains.hp, result.statGains.mp, characterId]
          );
          char.level = result.newLevel;
          char.exp = result.newExp;
          char.max_hp += result.statGains.hp;
          char.max_mp += result.statGains.mp;
          playerHp = char.max_hp;
          playerMp = char.max_mp;
          // 스탯 변화로 인한 유효스탯 재계산
          pStats = await getEffectiveStats(char);
        } else {
          await query('UPDATE characters SET exp=$1, gold=gold+$2 WHERE id=$3',
            [result.newExp, m.gold_reward, characterId]);
          char.exp = result.newExp;
        }

        // 퀘스트 진행
        await trackMonsterKill(characterId, currentMonsterId!);

        // 드랍
        const drops = rollDrops({ ...m, id: currentMonsterId!, level: 0, max_hp: 0, stats: { str: 0, dex: 0, int: 0, vit: 0, spd: 0, cri: 0 } });
        for (const drop of drops) {
          const { overflow } = await addItemToInventory(characterId, drop.itemId, drop.qty);
          if (overflow > 0) {
            await deliverToMailbox(characterId, '가방 초과분', '가방이 가득 차서 우편으로 배송되었습니다.', drop.itemId, overflow);
          }
          log.push(`아이템 획득!`);
        }

        // 다음 몬스터 스폰
        const spawn = await spawnMonster(characterId, session.field_id, now);
        if (spawn) {
          mStats = spawn.stats;
          monsterHp = spawn.monster.max_hp;
          currentMonsterId = spawn.monster.id;
          currentMonsterMaxHp = spawn.monster.max_hp;
          nextMonsterAt = new Date(now.getTime() + spawn.stats.tickMs);
          log.push(`${spawn.monster.name}이(가) 나타났다!`);
        } else {
          currentMonsterId = null;
          currentMonsterMaxHp = 0;
        }
      }
    } else {
      // === 몬스터 행동 ===
      const d = calcDamage(mStats, pStats, 1.0, false);
      if (d.miss) log.push('몬스터 공격 빗나감!');
      else {
        playerHp -= d.damage;
        log.push(`몬스터가 ${d.damage} 데미지${d.crit ? ' (치명타!)' : ''}`);
      }
      nextMonsterAt = new Date(nextMonsterAt.getTime() + mStats.tickMs);

      if (playerHp <= 0) {
        log.push('쓰러졌다... 마을로 돌아간다.');
        // 사망 페널티 없음 · HP/MP 50% 회복
        playerHp = Math.floor(char.max_hp * 0.5);
        playerMp = Math.floor(char.max_mp * 0.5);
        await query(
          'UPDATE characters SET hp=$1, mp=$2, location=$3, last_online_at=NOW() WHERE id=$4',
          [playerHp, playerMp, 'village', characterId]
        );
        await query('DELETE FROM combat_sessions WHERE character_id=$1', [characterId]);
        return {
          inCombat: false,
          fieldName,
          player: { hp: playerHp, maxHp: char.max_hp, mp: playerMp, maxMp: char.max_mp },
          log: log.slice(-MAX_LOG),
        };
      }
    }
  }

  // 세션 저장
  const trimmedLog = log.slice(-MAX_LOG);
  await query(
    `UPDATE combat_sessions
     SET monster_id=$1, monster_hp=$2, monster_max_hp=$3, monster_stats=$4,
         player_hp=$5, player_mp=$6, player_stats=$7,
         skill_cooldowns=$8, log=$9, next_player_action_at=$10, next_monster_action_at=$11, updated_at=$12
     WHERE character_id=$13`,
    [currentMonsterId, monsterHp, currentMonsterMaxHp, mStats, playerHp, playerMp, pStats, cooldowns, JSON.stringify(trimmedLog),
     nextPlayerAt.toISOString(), nextMonsterAt.toISOString(), now.toISOString(), characterId]
  );
  await query('UPDATE characters SET hp=$1, mp=$2, last_online_at=NOW() WHERE id=$3',
    [playerHp, playerMp, characterId]);

  const monsterInfo = currentMonsterId
    ? (await query<{ name: string; level: number }>('SELECT name, level FROM monsters WHERE id=$1', [currentMonsterId])).rows[0]
    : undefined;

  const potions = await countPotions(characterId);

  return {
    inCombat: true,
    fieldName,
    player: { hp: playerHp, maxHp: char.max_hp, mp: playerMp, maxMp: char.max_mp },
    monster: monsterInfo ? {
      name: monsterInfo.name,
      hp: Math.max(0, monsterHp),
      maxHp: currentMonsterMaxHp,
      level: monsterInfo.level,
    } : undefined,
    log: trimmedLog,
    now: now.getTime(),
    nextPlayerAt: nextPlayerAt.getTime(),
    nextMonsterAt: nextMonsterAt.getTime(),
    playerTickMs: Math.round(pStats.tickMs),
    monsterTickMs: Math.round(mStats.tickMs),
    potions,
  };
}
