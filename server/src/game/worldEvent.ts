import { query } from '../db/pool.js';
import { loadCharacter, getEffectiveStats } from './character.js';
import { addItemToInventory, deliverToMailbox } from './inventory.js';
import { applyExpGain } from './leveling.js';
// CharacterRow type used inline below
import type { Server } from 'socket.io';

const ATTACK_COOLDOWN_MS = 300_000; // 5분
const SIMULATION_SECONDS = 300; // 5분간 시뮬레이션

// ─── 활성 이벤트 조회 ───

export async function getActiveEvent() {
  const r = await query<{
    id: number; boss_id: number; current_hp: number; max_hp: number;
    started_at: string; ends_at: string; status: string;
    name: string; level: number; min_level: number;
  }>(
    `SELECT e.id, e.boss_id, e.current_hp, e.max_hp, e.started_at, e.ends_at, e.status,
            b.name, b.level, b.min_level
     FROM world_event_active e
     JOIN world_event_bosses b ON b.id = e.boss_id
     WHERE e.status = 'active'
     ORDER BY e.id DESC LIMIT 1`
  );
  return r.rows[0] ?? null;
}

// ─── 공격 ───

export async function attackBoss(characterId: number) {
  const event = await getActiveEvent();
  if (!event) return { error: '진행 중인 월드 이벤트가 없습니다.' };
  if (event.current_hp <= 0) return { error: '보스가 이미 쓰러졌습니다.' };

  const char = await loadCharacter(characterId);
  if (!char) return { error: '캐릭터를 찾을 수 없습니다.' };
  if (char.level < event.min_level) return { error: `Lv.${event.min_level} 이상만 참여 가능합니다.` };

  // 쿨다운 체크
  const existing = await query<{ last_attack_at: string }>(
    `SELECT last_attack_at FROM world_event_participants
     WHERE event_id = $1 AND character_id = $2`,
    [event.id, characterId]
  );
  if (existing.rows[0]) {
    const elapsed = Date.now() - new Date(existing.rows[0].last_attack_at).getTime();
    if (elapsed < ATTACK_COOLDOWN_MS) {
      return { error: '쿨다운 중입니다.', cooldownMs: ATTACK_COOLDOWN_MS - elapsed };
    }
  }

  // 5분간 전투 시뮬레이션
  const eff = await getEffectiveStats(char);
  const mageClass = ['mage', 'cleric'].includes(char.class_name);
  const rawDmg = mageClass ? eff.matk : eff.atk;

  // 보유 스킬 로드 — v0.9: 쿨타임=행동횟수, MP 없음
  const skillsR = await query<{ name: string; damage_mult: number; cooldown_actions: number; flat_damage: number }>(
    `SELECT s.name, s.damage_mult, s.cooldown_actions, s.flat_damage FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
     WHERE cs.character_id = $1 AND cs.auto_use = TRUE AND s.required_level <= $2 AND s.kind = 'damage'
     ORDER BY s.damage_mult DESC`,
    [characterId, char.level]
  );
  const skills = skillsR.rows;

  // 게이지 기반 시뮬레이션: 5분간
  const GAUGE_MAX = 1000;
  const totalSimTicks = SIMULATION_SECONDS * 10; // 100ms 틱 = 10 per sec
  let totalDamage = 0;
  let critCount = 0;
  let skillUseCount = 0;
  let gauge = 0;
  let actionCount = 0;
  const cooldowns: Map<string, number> = new Map(); // 스킬명 → 남은 행동 수
  const skillLog: { name: string; damage: number; crit: boolean }[] = [];

  for (let t = 0; t < totalSimTicks; t++) {
    gauge += eff.spd;
    if (gauge < GAUGE_MAX) continue;

    gauge = 0;
    actionCount++;

    // 쿨다운 감소
    for (const [skName, cd] of cooldowns) {
      if (cd > 0) cooldowns.set(skName, cd - 1);
      if (cd <= 1) cooldowns.delete(skName);
    }

    let used = false;
    for (const sk of skills) {
      const cd = cooldowns.get(sk.name) ?? 0;
      if (cd > 0) continue;

      const isCrit = Math.random() * 100 < eff.cri;
      let dmg = Math.round(rawDmg * sk.damage_mult * (0.9 + Math.random() * 0.2)) + (sk.flat_damage || 0);
      if (isCrit) { dmg = Math.round(dmg * 1.5); critCount++; }
      totalDamage += dmg;
      if (sk.cooldown_actions > 0) cooldowns.set(sk.name, sk.cooldown_actions);
      skillUseCount++;
      if (skillLog.length < 10) skillLog.push({ name: sk.name, damage: dmg, crit: isCrit });
      used = true;
      break;
    }

    if (!used) {
      const isCrit = Math.random() * 100 < eff.cri;
      let dmg = Math.round(rawDmg * (0.9 + Math.random() * 0.2));
      if (isCrit) { dmg = Math.round(dmg * 1.5); critCount++; }
      totalDamage += dmg;
      if (skillLog.length < 10) skillLog.push({ name: '기본 공격', damage: dmg, crit: isCrit });
    }
  }

  const damage = totalDamage;

  // HP 원자적 감소
  const upd = await query<{ current_hp: number }>(
    `UPDATE world_event_active
     SET current_hp = GREATEST(0, current_hp - $1)
     WHERE id = $2 AND status = 'active'
     RETURNING current_hp`,
    [damage, event.id]
  );
  if (upd.rowCount === 0) return { error: '이벤트가 종료되었습니다.' };
  const newHp = upd.rows[0].current_hp;

  // 참여자 업서트
  await query(
    `INSERT INTO world_event_participants (event_id, character_id, total_damage, attack_count, last_attack_at)
     VALUES ($1, $2, $3, 1, NOW())
     ON CONFLICT (event_id, character_id) DO UPDATE
     SET total_damage = world_event_participants.total_damage + $3,
         attack_count = world_event_participants.attack_count + 1,
         last_attack_at = NOW()`,
    [event.id, characterId, damage]
  );

  // 내 데미지/순위
  const myRow = await query<{ total_damage: number; attack_count: number; rank: number }>(
    `SELECT total_damage, attack_count,
            (SELECT COUNT(*) + 1 FROM world_event_participants p2
             WHERE p2.event_id = $1 AND p2.total_damage > p.total_damage)::int AS rank
     FROM world_event_participants p
     WHERE event_id = $1 AND character_id = $2`,
    [event.id, characterId]
  );
  const my = myRow.rows[0];

  return {
    damage,
    totalTicks: actionCount,
    skillUseCount,
    critCount,
    skillLog,
    currentHp: newHp,
    maxHp: event.max_hp,
    myDamage: my?.total_damage ?? damage,
    myRank: my?.rank ?? 1,
    myAttackCount: my?.attack_count ?? 1,
    defeated: newHp <= 0,
  };
}

// ─── 리더보드 ───

export async function getLeaderboard(eventId: number, limit = 20) {
  const r = await query<{ character_name: string; class_name: string; total_damage: number }>(
    `SELECT c.name AS character_name, c.class_name, p.total_damage
     FROM world_event_participants p
     JOIN characters c ON c.id = p.character_id
     JOIN users u ON u.id = c.user_id
     WHERE p.event_id = $1 AND u.is_admin = FALSE
     ORDER BY p.total_damage DESC
     LIMIT $2`,
    [eventId, limit]
  );
  return r.rows.map((row, i) => ({
    rank: i + 1,
    characterName: row.character_name,
    className: row.class_name,
    damage: row.total_damage,
  }));
}

// ─── S등급 보상: 3옵 랜덤 악세서리 ───

async function grantRandomAccessory(characterId: number, prefixCount: number = 3): Promise<string> {
  // 등급 결정: 희귀 90%, 영웅 9%, 전설 1%
  const roll = Math.random() * 100;
  let grade: string;
  if (roll < 1) grade = 'legendary';
  else if (roll < 10) grade = 'epic';
  else grade = 'rare';

  // 해당 등급 악세서리 랜덤 선택
  const items = await query<{ id: number; name: string }>(
    `SELECT id, name FROM items WHERE type = 'accessory' AND grade = $1 AND slot IS NOT NULL`,
    [grade]
  );
  if (items.rowCount === 0) return '(악세서리 없음)';
  const picked = items.rows[Math.floor(Math.random() * items.rows.length)];

  // 접두사 강제 생성 (prefixCount개)
  const allPrefixes = await query<{ id: number; name: string; tier: number; stat_key: string; min_val: number; max_val: number }>(
    'SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes ORDER BY id'
  );
  const prefixIds: number[] = [];
  const bonusStats: Record<string, number> = {};
  const usedKeys = new Set<string>();

  for (let i = 0; i < prefixCount; i++) {
    // 등급 롤
    const tRoll = Math.random() * 100;
    let tier: number;
    if (tRoll < 0.1) tier = 4;
    else if (tRoll < 1) tier = 3;
    else if (tRoll < 10) tier = 2;
    else tier = 1;

    const candidates = allPrefixes.rows.filter(p => p.tier === tier && !usedKeys.has(p.stat_key));
    if (candidates.length === 0) continue;
    const pf = candidates[Math.floor(Math.random() * candidates.length)];
    const val = pf.min_val + Math.floor(Math.random() * (pf.max_val - pf.min_val + 1));
    prefixIds.push(pf.id);
    bonusStats[pf.stat_key] = (bonusStats[pf.stat_key] ?? 0) + val;
    usedKeys.add(pf.stat_key);
  }

  // 인벤토리에 추가
  const usedR = await query<{ slot_index: number }>('SELECT slot_index FROM character_inventory WHERE character_id = $1', [characterId]);
  const used = new Set(usedR.rows.map(r => r.slot_index));
  let freeSlot = -1;
  for (let i = 0; i < 60; i++) { if (!used.has(i)) { freeSlot = i; break; } }

  const prefixNames = allPrefixes.rows.filter(p => prefixIds.includes(p.id)).map(p => p.name).join(' ');
  const fullName = prefixNames ? `${prefixNames} ${picked.name}` : picked.name;

  if (freeSlot >= 0) {
    await query(
      `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, prefix_ids, prefix_stats)
       VALUES ($1, $2, $3, 1, $4, $5)`,
      [characterId, picked.id, freeSlot, prefixIds, JSON.stringify(bonusStats)]
    );
  } else {
    await deliverToMailbox(characterId, '월드 이벤트 S등급 보상', `${fullName} — 가방이 가득 차 우편으로 발송`, picked.id, 1);
  }

  // 드롭 로그
  const charInfo = await query<{ name: string }>('SELECT name FROM characters WHERE id = $1', [characterId]);
  await query(
    `INSERT INTO item_drop_log (character_id, character_name, item_name, item_grade, prefix_count, prefix_names)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [characterId, charInfo.rows[0]?.name ?? '???', fullName, grade, prefixIds.length, prefixNames]
  );

  return fullName;
}

// ─── 보상 분배 ───

async function distributeRewards(eventId: number) {
  const boss = await query<{ reward_table: unknown }>(
    `SELECT b.reward_table FROM world_event_active e
     JOIN world_event_bosses b ON b.id = e.boss_id WHERE e.id = $1`,
    [eventId]
  );
  if (boss.rowCount === 0) return;
  const tiers = boss.rows[0].reward_table as Array<{
    tier: string;
    minRank?: number; maxRank?: number;
    minPct?: number; maxPct?: number;
    rewards: { itemId?: number; qty?: number; gold?: number; exp?: number };
  }>;

  const participants = await query<{ character_id: number; total_damage: number }>(
    `SELECT character_id, total_damage FROM world_event_participants
     WHERE event_id = $1 ORDER BY total_damage DESC`,
    [eventId]
  );
  const total = participants.rows.length;
  if (total === 0) return;

  for (let i = 0; i < participants.rows.length; i++) {
    const p = participants.rows[i];
    const rank = i + 1;
    // 상위 몇 %인지 (1등=0%, 꼴등=100%)
    const topPct = total <= 1 ? 0 : ((rank - 1) / (total - 1)) * 100;

    // 매칭 티어 찾기: rank 기반 우선, 그 다음 pct 기반
    let matched = tiers[tiers.length - 1]; // 폴백: 마지막 티어 (C등급)
    for (const t of tiers) {
      if (t.minRank != null && t.maxRank != null && rank >= t.minRank && rank <= t.maxRank) {
        matched = t; break;
      }
      if (t.minPct != null && t.maxPct != null && topPct >= t.minPct && topPct < t.maxPct) {
        matched = t; break;
      }
    }

    const rw = matched.rewards;
    const tierLabel = matched.tier;

    // S등급: 3옵 랜덤 악세서리 추가 지급
    if (tierLabel === 'S') {
      const itemName = await grantRandomAccessory(p.character_id, 3);
      await deliverToMailbox(p.character_id, '월드 이벤트 S등급 특별 보상', `축하합니다! ${itemName}을(를) 획득했습니다.`, 0, 0, 0);
    }
    // A등급: 2옵 랜덤 악세서리 추가 지급
    if (tierLabel === 'A') {
      const itemName = await grantRandomAccessory(p.character_id, 2);
      await deliverToMailbox(p.character_id, '월드 이벤트 A등급 특별 보상', `축하합니다! ${itemName}을(를) 획득했습니다.`, 0, 0, 0);
    }
    // B등급: 1옵 랜덤 악세서리 추가 지급
    if (tierLabel === 'B') {
      const itemName = await grantRandomAccessory(p.character_id, 1);
      await deliverToMailbox(p.character_id, '월드 이벤트 B등급 특별 보상', `축하합니다! ${itemName}을(를) 획득했습니다.`, 0, 0, 0);
    }

    // C등급: 랜덤상자 1개 (출석 보상과 동일)
    if (tierLabel === 'C') {
      // 랜덤 아이템 1개 (일반70%/희귀20%/영웅8%/전설2%)
      const gradeRoll = Math.random() * 100;
      let boxGrade: string;
      if (gradeRoll < 2) boxGrade = 'legendary';
      else if (gradeRoll < 10) boxGrade = 'epic';
      else if (gradeRoll < 30) boxGrade = 'rare';
      else boxGrade = 'common';
      const boxItems = await query<{ id: number; name: string }>(
        `SELECT id, name FROM items WHERE grade = $1 AND type != 'material' ORDER BY RANDOM() LIMIT 1`, [boxGrade]
      );
      if (boxItems.rows[0]) {
        const { overflow } = await addItemToInventory(p.character_id, boxItems.rows[0].id, 1);
        if (overflow > 0) {
          await deliverToMailbox(p.character_id, '월드 이벤트 C등급 보상', '랜덤 상자 아이템 — 가방 초과로 우편 발송', boxItems.rows[0].id, 1);
        }
        await deliverToMailbox(p.character_id, '월드 이벤트 C등급 보상', `참여 보상: ${boxItems.rows[0].name}`, 0, 0, 0);
      }
    }

    // 골드 지급
    if (rw.gold) {
      await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [rw.gold, p.character_id]);
    }
    // 경험치 지급
    if (rw.exp) {
      const charR = await query<{ level: number; exp: string }>(
        'SELECT level, exp FROM characters WHERE id = $1', [p.character_id]
      );
      if (charR.rows[0]) {
        const cr = charR.rows[0];
        const classR = await query<{ class_name: string }>('SELECT class_name FROM characters WHERE id = $1', [p.character_id]);
        const className = classR.rows[0]?.class_name || 'warrior';
        const result = applyExpGain(cr.level, Number(cr.exp), rw.exp, className);
        const g = result.statGrowth;
        await query(
          `UPDATE characters SET level = $1, exp = $2,
           max_hp = max_hp + $3, node_points = node_points + $4,
           stats = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
             stats,
             '{str}', (COALESCE((stats->>'str')::int,0) + $6)::text::jsonb),
             '{dex}', (COALESCE((stats->>'dex')::int,0) + $7)::text::jsonb),
             '{int}', (COALESCE((stats->>'int')::int,0) + $8)::text::jsonb),
             '{vit}', (COALESCE((stats->>'vit')::int,0) + $9)::text::jsonb),
             '{spd}', (COALESCE((stats->>'spd')::int,0) + $10)::text::jsonb),
             '{cri}', (COALESCE((stats->>'cri')::int,0) + $11)::text::jsonb)
           WHERE id = $5`,
          [result.newLevel, result.newExp,
           result.hpGained, result.nodePointsGained, p.character_id,
           g.str, g.dex, g.int, g.vit, g.spd, g.cri]
        );
      }
    }
    // 아이템 지급 (메일)
    if (rw.itemId && rw.qty) {
      const { overflow } = await addItemToInventory(p.character_id, rw.itemId, rw.qty);
      if (overflow > 0) {
        await deliverToMailbox(p.character_id, `월드 이벤트 보상 (${tierLabel})`, '인벤토리가 가득 차 메일로 발송되었습니다.', rw.itemId, overflow);
      }
    }
    // 보상 알림 메일
    await deliverToMailbox(p.character_id, `월드 이벤트 보상 (${tierLabel}등급)`,
      `순위 ${rank}위 · 총 데미지 ${p.total_damage.toLocaleString()}\n` +
      `보상: ${rw.gold?.toLocaleString() ?? 0}G, 경험치 ${rw.exp?.toLocaleString() ?? 0}`,
      0, 0, 0
    );
  }
}

// ─── 보스 처치 처리 ───

export async function finishEvent(eventId: number, status: 'defeated' | 'expired', io?: Server) {
  await query(
    `UPDATE world_event_active SET status = $1, finished_at = NOW() WHERE id = $2`,
    [status, eventId]
  );

  const boss = await query<{ name: string }>(
    `SELECT b.name FROM world_event_active e JOIN world_event_bosses b ON b.id = e.boss_id WHERE e.id = $1`,
    [eventId]
  );
  const bossName = boss.rows[0]?.name ?? '???';

  if (status === 'defeated') {
    await distributeRewards(eventId);
  }

  if (io) {
    io.emit('world_event', { type: 'world_event_end', bossName, result: status });
  }
}

// ─── 스케줄러 ───

export async function checkAndSpawnWorldEvent(io?: Server) {
  // 이미 활성 이벤트가 있으면 스킵
  const active = await getActiveEvent();
  if (active) return;

  const now = new Date();
  const hour = now.getUTCHours();

  // 현재 시간에 예정된 스케줄 확인
  const sched = await query<{ boss_id: number }>(
    `SELECT boss_id FROM world_event_schedule WHERE hour_utc = $1 AND enabled = TRUE LIMIT 1`,
    [hour]
  );
  if (sched.rowCount === 0) return;

  // 같은 시간대에 이미 스폰한 적 있는지 확인 (1시간 이내)
  const recent = await query(
    `SELECT id FROM world_event_active WHERE started_at > NOW() - INTERVAL '1 hour'`
  );
  if ((recent.rowCount ?? 0) > 0) return;

  const bossId = sched.rows[0].boss_id;
  const bossR = await query<{ name: string; max_hp: number; level: number; time_limit_sec: number }>(
    `SELECT name, max_hp, level, time_limit_sec FROM world_event_bosses WHERE id = $1`,
    [bossId]
  );
  if (bossR.rowCount === 0) return;
  const boss = bossR.rows[0];

  await query(
    `INSERT INTO world_event_active (boss_id, current_hp, max_hp, ends_at)
     VALUES ($1, $2, $2, NOW() + INTERVAL '1 second' * $3)`,
    [bossId, boss.max_hp, boss.time_limit_sec]
  );

  console.log(`[world-event] Spawned: ${boss.name}`);
  if (io) {
    const endsAt = new Date(Date.now() + boss.time_limit_sec * 1000).toISOString();
    io.emit('world_event', { type: 'world_event_start', bossName: boss.name, endsAt });
  }
}

export async function checkExpiredWorldEvents(io?: Server) {
  const expired = await query<{ id: number }>(
    `SELECT id FROM world_event_active WHERE status = 'active' AND ends_at < NOW()`
  );
  for (const row of expired.rows) {
    await finishEvent(row.id, 'expired', io);
    console.log(`[world-event] Expired: event #${row.id}`);
  }

  // 보스 HP 0인데 아직 active인 이벤트 처리
  const defeated = await query<{ id: number }>(
    `SELECT id FROM world_event_active WHERE status = 'active' AND current_hp <= 0`
  );
  for (const row of defeated.rows) {
    await finishEvent(row.id, 'defeated', io);
    console.log(`[world-event] Defeated: event #${row.id}`);
  }
}
