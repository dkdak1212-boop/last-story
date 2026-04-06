import { query } from '../db/pool.js';
import { loadCharacter, getEffectiveStats } from './character.js';
import { addItemToInventory, deliverToMailbox } from './inventory.js';
import { applyExpGain } from './leveling.js';
import type { CharacterRow } from './character.js';
import type { Server } from 'socket.io';

const ATTACK_COOLDOWN_MS = 3000;

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

  // 데미지 계산
  const eff = await getEffectiveStats(char);
  const rawDmg = Math.max(eff.atk, eff.matk);
  const damage = Math.round(rawDmg * (0.9 + Math.random() * 0.2));

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
     WHERE p.event_id = $1
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
    const pct = (rank / total) * 100;

    // 매칭 티어 찾기
    let matched = tiers[tiers.length - 1]; // 기본: 최하위 티어
    for (const t of tiers) {
      if (t.minRank != null && t.maxRank != null && rank >= t.minRank && rank <= t.maxRank) {
        matched = t; break;
      }
      if (t.minPct != null && t.maxPct != null && pct > t.minPct && pct <= t.maxPct) {
        matched = t; break;
      }
    }

    const rw = matched.rewards;
    const tierLabel = matched.tier;

    // 골드 지급
    if (rw.gold) {
      await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [rw.gold, p.character_id]);
    }
    // 경험치 지급
    if (rw.exp) {
      const charR = await query<CharacterRow>(
        'SELECT class_name, level, exp FROM characters WHERE id = $1', [p.character_id]
      );
      if (charR.rows[0]) {
        const cr = charR.rows[0];
        const result = applyExpGain(cr.class_name, cr.level, Number(cr.exp), rw.exp);
        await query(
          `UPDATE characters SET level = $1, exp = $2,
           stats = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(stats,
             '{str}', to_jsonb((stats->>'str')::numeric + $4)),
             '{dex}', to_jsonb((stats->>'dex')::numeric + $5)),
             '{int}', to_jsonb((stats->>'int')::numeric + $6)),
             '{vit}', to_jsonb((stats->>'vit')::numeric + $7)),
             '{spd}', to_jsonb((stats->>'spd')::numeric + $8)),
             '{cri}', to_jsonb((stats->>'cri')::numeric + $9)),
           max_hp = max_hp + $10, max_mp = max_mp + $11
           WHERE id = $3`,
          [result.newLevel, result.newExp, p.character_id,
           result.statGains.str, result.statGains.dex, result.statGains.int,
           result.statGains.vit, result.statGains.spd, result.statGains.cri,
           result.statGains.hp, result.statGains.mp]
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
