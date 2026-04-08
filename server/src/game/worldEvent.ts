import { query } from '../db/pool.js';
import { loadCharacter, getEffectiveStats } from './character.js';
import { addItemToInventory, deliverToMailbox } from './inventory.js';
import { applyExpGain } from './leveling.js';
import type { Server } from 'socket.io';

const ATTACK_COOLDOWN_MS = 3_000; // 3초 쿨다운

// 페이즈 정의: HP% 기준
const PHASES = [
  { phase: 1, hpPctMin: 60, hpPctMax: 100, patterns: ['normal', 'defense', 'normal'] },
  { phase: 2, hpPctMin: 30, hpPctMax: 60, patterns: ['rage', 'normal', 'aoe', 'normal'] },
  { phase: 3, hpPctMin: 0, hpPctMax: 30, patterns: ['rage', 'aoe', 'defense', 'aoe', 'rage'] },
];

// 패턴별 효과
const PATTERN_EFFECTS: Record<string, { dmgMult: number; counterPct: number; label: string; duration: number }> = {
  normal:  { dmgMult: 1.0, counterPct: 0, label: '일반', duration: 20 },
  defense: { dmgMult: 0.3, counterPct: 0, label: '방어 태세 — 받는 피해 70% 감소', duration: 15 },
  rage:    { dmgMult: 1.0, counterPct: 20, label: '분노 — 반격 데미지 20%', duration: 20 },
  aoe:     { dmgMult: 1.0, counterPct: 0, label: '전체 공격 — 참가자 HP 10% 감소', duration: 10 },
};

// ─── 활성 이벤트 조회 ───
export async function getActiveEvent() {
  const r = await query<{
    id: number; boss_id: number; current_hp: number; max_hp: number;
    started_at: string; ends_at: string; status: string;
    name: string; level: number; min_level: number;
    current_phase: number; phase_pattern: string; phase_changed_at: string;
  }>(
    `SELECT e.id, e.boss_id, e.current_hp, e.max_hp, e.started_at, e.ends_at, e.status,
            b.name, b.level, b.min_level,
            e.current_phase, e.phase_pattern, e.phase_changed_at
     FROM world_event_active e
     JOIN world_event_bosses b ON b.id = e.boss_id
     WHERE e.status = 'active'
     ORDER BY e.id DESC LIMIT 1`
  );
  return r.rows[0] ?? null;
}

// ─── 페이즈/패턴 업데이트 ───
async function updatePhaseAndPattern(eventId: number, currentHp: number, maxHp: number, phaseChangedAt: string, io?: Server, bossName?: string) {
  const hpPct = (currentHp / maxHp) * 100;
  const currentPhase = hpPct > 60 ? 1 : hpPct > 30 ? 2 : 3;

  // 현재 저장된 페이즈 확인
  const evR = await query<{ current_phase: number; phase_pattern: string }>(
    'SELECT current_phase, phase_pattern FROM world_event_active WHERE id = $1', [eventId]
  );
  const savedPhase = evR.rows[0]?.current_phase || 1;

  // 페이즈 변경 시
  if (currentPhase !== savedPhase) {
    const phaseDef = PHASES.find(p => p.phase === currentPhase);
    const newPattern = phaseDef?.patterns[0] || 'normal';
    await query(
      `UPDATE world_event_active SET current_phase = $1, phase_pattern = $2, phase_changed_at = NOW() WHERE id = $3`,
      [currentPhase, newPattern, eventId]
    );
    // 잠시 무적 효과 (2초간 데미지 0) → phase_changed_at 기준으로 클라이언트에서 처리
    if (io) {
      io.emit('world_event', {
        type: 'phase_change', phase: currentPhase, pattern: newPattern,
        patternLabel: PATTERN_EFFECTS[newPattern]?.label || '일반',
        bossName: bossName || '???',
      });
    }
    return;
  }

  // 같은 페이즈 내 패턴 자동 순환 (duration초마다)
  const elapsed = (Date.now() - new Date(phaseChangedAt).getTime()) / 1000;
  const phaseDef = PHASES.find(p => p.phase === currentPhase);
  if (!phaseDef) return;

  const currentPattern = evR.rows[0]?.phase_pattern || 'normal';
  const currentEffect = PATTERN_EFFECTS[currentPattern];
  if (elapsed >= (currentEffect?.duration || 20)) {
    // 다음 패턴으로 순환
    const idx = phaseDef.patterns.indexOf(currentPattern);
    const nextIdx = (idx + 1) % phaseDef.patterns.length;
    const nextPattern = phaseDef.patterns[nextIdx];
    await query(
      `UPDATE world_event_active SET phase_pattern = $1, phase_changed_at = NOW() WHERE id = $2`,
      [nextPattern, eventId]
    );
    if (io && nextPattern !== currentPattern) {
      io.emit('world_event', {
        type: 'pattern_change', phase: currentPhase, pattern: nextPattern,
        patternLabel: PATTERN_EFFECTS[nextPattern]?.label || '일반',
        bossName: bossName || '???',
      });
    }
  }
}

// ─── 공격 ───
export async function attackBoss(characterId: number, io?: Server) {
  const event = await getActiveEvent();
  if (!event) return { error: '진행 중인 월드 이벤트가 없습니다.' };
  if (event.current_hp <= 0) return { error: '보스가 이미 쓰러졌습니다.' };

  const char = await loadCharacter(characterId);
  if (!char) return { error: '캐릭터를 찾을 수 없습니다.' };
  if (char.level < event.min_level) return { error: `Lv.${event.min_level} 이상만 참여 가능합니다.` };

  // 페이즈 전환 무적 (2초)
  const phaseElapsed = Date.now() - new Date(event.phase_changed_at).getTime();
  if (phaseElapsed < 2000) {
    return { error: '페이즈 전환 중... 잠시 후 공격하세요.', cooldownMs: 2000 - phaseElapsed };
  }

  // 쿨다운 체크
  const existing = await query<{ last_attack_at: string }>(
    `SELECT last_attack_at FROM world_event_participants WHERE event_id = $1 AND character_id = $2`,
    [event.id, characterId]
  );
  if (existing.rows[0]) {
    const elapsed = Date.now() - new Date(existing.rows[0].last_attack_at).getTime();
    if (elapsed < ATTACK_COOLDOWN_MS) {
      return { error: '쿨다운 중입니다.', cooldownMs: ATTACK_COOLDOWN_MS - elapsed };
    }
  }

  // 스탯 계산
  const eff = await getEffectiveStats(char);
  const mageClass = ['mage', 'cleric'].includes(char.class_name);
  const rawDmg = mageClass ? eff.matk : eff.atk;

  // 스킬 1개 사용 (가장 강한 데미지 스킬)
  const skillR = await query<{ name: string; damage_mult: number; flat_damage: number }>(
    `SELECT s.name, s.damage_mult, s.flat_damage FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
     WHERE cs.character_id = $1 AND cs.auto_use = TRUE AND s.required_level <= $2 AND s.kind = 'damage'
     ORDER BY s.damage_mult DESC LIMIT 1`,
    [characterId, char.level]
  );
  const skill = skillR.rows[0];

  const isCrit = Math.random() * 100 < eff.cri;
  let baseDmg: number;
  let skillName: string;
  if (skill) {
    baseDmg = Math.round(rawDmg * skill.damage_mult * (0.9 + Math.random() * 0.2)) + (skill.flat_damage || 0);
    skillName = skill.name;
  } else {
    baseDmg = Math.round(rawDmg * (0.9 + Math.random() * 0.2));
    skillName = '기본 공격';
  }
  if (isCrit) baseDmg = Math.round(baseDmg * 2.0);

  // 패턴 효과 적용
  const pattern = event.phase_pattern || 'normal';
  const effect = PATTERN_EFFECTS[pattern] || PATTERN_EFFECTS.normal;
  const finalDmg = Math.round(baseDmg * effect.dmgMult);

  // 분노 패턴: 반격 데미지 (캐릭터 HP 감소)
  let counterDmg = 0;
  if (effect.counterPct > 0) {
    counterDmg = Math.round(char.max_hp * effect.counterPct / 100);
    const newHp = Math.max(1, char.hp - counterDmg);
    await query('UPDATE characters SET hp = $1 WHERE id = $2', [newHp, characterId]);
  }

  // 전체 공격 패턴: 참가자 HP 10% 감소 (공격한 사람만)
  let aoeDmg = 0;
  if (pattern === 'aoe') {
    aoeDmg = Math.round(char.max_hp * 0.1);
    const newHp = Math.max(1, char.hp - aoeDmg);
    await query('UPDATE characters SET hp = $1 WHERE id = $2', [newHp, characterId]);
  }

  // HP 원자적 감소
  const upd = await query<{ current_hp: number }>(
    `UPDATE world_event_active SET current_hp = GREATEST(0, current_hp - $1) WHERE id = $2 AND status = 'active' RETURNING current_hp`,
    [finalDmg, event.id]
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
    [event.id, characterId, finalDmg]
  );

  // 참여 보상: 0.5% 확률로 특별 아이템
  let participationReward: string | null = null;
  if (Math.random() < 0.005) {
    const itemName = await grantRandomAccessory(characterId, 2);
    participationReward = itemName;
    await deliverToMailbox(characterId, '레이드 참여 행운 보상!', `행운의 보상: ${itemName}`, 0, 0, 0);
  }

  // 페이즈/패턴 업데이트
  await updatePhaseAndPattern(event.id, newHp, event.max_hp, event.phase_changed_at, io, event.name);

  // 내 순위
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
    damage: finalDmg,
    skillName,
    crit: isCrit,
    counterDmg,
    aoeDmg,
    pattern,
    patternLabel: effect.label,
    phase: newHp / event.max_hp > 0.6 ? 1 : newHp / event.max_hp > 0.3 ? 2 : 3,
    currentHp: newHp,
    maxHp: event.max_hp,
    myDamage: my?.total_damage ?? finalDmg,
    myRank: my?.rank ?? 1,
    myAttackCount: my?.attack_count ?? 1,
    defeated: newHp <= 0,
    participationReward,
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
     ORDER BY p.total_damage DESC LIMIT $2`,
    [eventId, limit]
  );
  return r.rows.map((row, i) => ({
    rank: i + 1, characterName: row.character_name,
    className: row.class_name, damage: row.total_damage,
  }));
}

// ─── 랜덤 악세서리 지급 ───
async function grantRandomAccessory(characterId: number, prefixCount: number = 3): Promise<string> {
  const roll = Math.random() * 100;
  let grade: string;
  if (roll < 1) grade = 'legendary';
  else if (roll < 10) grade = 'epic';
  else grade = 'rare';

  const items = await query<{ id: number; name: string }>(
    `SELECT id, name FROM items WHERE type = 'accessory' AND grade = $1 AND slot IS NOT NULL`, [grade]
  );
  if (items.rowCount === 0) return '(없음)';
  const picked = items.rows[Math.floor(Math.random() * items.rows.length)];

  const allPrefixes = await query<{ id: number; name: string; tier: number; stat_key: string; min_val: number; max_val: number }>(
    'SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes ORDER BY id'
  );
  const prefixIds: number[] = [];
  const bonusStats: Record<string, number> = {};
  const usedKeys = new Set<string>();
  for (let i = 0; i < prefixCount; i++) {
    const tRoll = Math.random() * 100;
    const tier = tRoll < 0.1 ? 4 : tRoll < 1 ? 3 : tRoll < 10 ? 2 : 1;
    const candidates = allPrefixes.rows.filter(p => p.tier === tier && !usedKeys.has(p.stat_key));
    if (candidates.length === 0) continue;
    const pf = candidates[Math.floor(Math.random() * candidates.length)];
    const val = pf.min_val + Math.floor(Math.random() * (pf.max_val - pf.min_val + 1));
    prefixIds.push(pf.id);
    bonusStats[pf.stat_key] = (bonusStats[pf.stat_key] ?? 0) + val;
    usedKeys.add(pf.stat_key);
  }

  await deliverToMailbox(characterId, '레이드 보상 아이템', `${picked.name}`, picked.id, 1);
  return picked.name;
}

// ─── 보상 분배 ───
async function distributeRewards(eventId: number) {
  const boss = await query<{ reward_table: unknown }>(
    `SELECT b.reward_table FROM world_event_active e JOIN world_event_bosses b ON b.id = e.boss_id WHERE e.id = $1`, [eventId]
  );
  if (boss.rowCount === 0) return;
  const tiers = boss.rows[0].reward_table as Array<{
    tier: string; minRank?: number; maxRank?: number; minPct?: number; maxPct?: number;
    rewards: { itemId?: number; qty?: number; gold?: number; exp?: number };
  }>;

  const participants = await query<{ character_id: number; total_damage: number }>(
    `SELECT character_id, total_damage FROM world_event_participants WHERE event_id = $1 ORDER BY total_damage DESC`, [eventId]
  );
  const total = participants.rows.length;
  if (total === 0) return;

  for (let i = 0; i < participants.rows.length; i++) {
    const p = participants.rows[i];
    const rank = i + 1;
    const topPct = total <= 1 ? 0 : ((rank - 1) / (total - 1)) * 100;

    let matched = tiers[tiers.length - 1];
    for (const t of tiers) {
      if (t.minRank != null && t.maxRank != null && rank >= t.minRank && rank <= t.maxRank) { matched = t; break; }
      if (t.minPct != null && t.maxPct != null && topPct >= t.minPct && topPct < t.maxPct) { matched = t; break; }
    }

    const rw = matched.rewards;
    const tierLabel = matched.tier;

    // 등급별 특별 보상
    if (tierLabel === 'S') await grantRandomAccessory(p.character_id, 3);
    else if (tierLabel === 'A') await grantRandomAccessory(p.character_id, 2);
    else if (tierLabel === 'B') await grantRandomAccessory(p.character_id, 1);

    // 골드
    if (rw.gold) await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [rw.gold, p.character_id]);
    // 경험치
    if (rw.exp) {
      const cr = await query<{ level: number; exp: string; class_name: string }>(
        'SELECT level, exp, class_name FROM characters WHERE id = $1', [p.character_id]
      );
      if (cr.rows[0]) {
        const result = applyExpGain(cr.rows[0].level, Number(cr.rows[0].exp), rw.exp, cr.rows[0].class_name);
        const g = result.statGrowth;
        await query(
          `UPDATE characters SET level=$1, exp=$2, max_hp=max_hp+$3, node_points=node_points+$4,
           stats = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(stats,
             '{str}',(COALESCE((stats->>'str')::int,0)+$6)::text::jsonb),
             '{dex}',(COALESCE((stats->>'dex')::int,0)+$7)::text::jsonb),
             '{int}',(COALESCE((stats->>'int')::int,0)+$8)::text::jsonb),
             '{vit}',(COALESCE((stats->>'vit')::int,0)+$9)::text::jsonb),
             '{spd}',(COALESCE((stats->>'spd')::int,0)+$10)::text::jsonb),
             '{cri}',(COALESCE((stats->>'cri')::int,0)+$11)::text::jsonb)
           WHERE id=$5`,
          [result.newLevel, result.newExp, result.hpGained, result.nodePointsGained, p.character_id,
           g.str, g.dex, g.int, g.vit, g.spd, g.cri]
        );
      }
    }
    // 아이템
    if (rw.itemId && rw.qty) {
      const { overflow } = await addItemToInventory(p.character_id, rw.itemId, rw.qty);
      if (overflow > 0) await deliverToMailbox(p.character_id, `레이드 보상 (${tierLabel})`, '우편 발송', rw.itemId, overflow);
    }
    // 알림
    await deliverToMailbox(p.character_id, `레이드 보상 (${tierLabel}등급)`,
      `순위 ${rank}위 · 데미지 ${p.total_damage.toLocaleString()}\n보상: ${rw.gold?.toLocaleString() ?? 0}G, 경험치 ${rw.exp?.toLocaleString() ?? 0}`,
      0, 0, 0);
  }
}

// ─── 보스 처치/만료 ───
export async function finishEvent(eventId: number, status: 'defeated' | 'expired', io?: Server) {
  await query(`UPDATE world_event_active SET status = $1, finished_at = NOW() WHERE id = $2`, [status, eventId]);
  const boss = await query<{ name: string }>(
    `SELECT b.name FROM world_event_active e JOIN world_event_bosses b ON b.id = e.boss_id WHERE e.id = $1`, [eventId]
  );
  if (status === 'defeated') await distributeRewards(eventId);
  if (io) io.emit('world_event', { type: 'world_event_end', bossName: boss.rows[0]?.name ?? '???', result: status });
}

// ─── 스케줄러 ───
export async function checkAndSpawnWorldEvent(io?: Server) {
  const active = await getActiveEvent();
  if (active) return;
  const now = new Date();
  const hour = now.getUTCHours();
  const sched = await query<{ boss_id: number }>(`SELECT boss_id FROM world_event_schedule WHERE hour_utc = $1 AND enabled = TRUE LIMIT 1`, [hour]);
  if (sched.rowCount === 0) return;
  const recent = await query(`SELECT id FROM world_event_active WHERE started_at > NOW() - INTERVAL '1 hour'`);
  if ((recent.rowCount ?? 0) > 0) return;
  const bossR = await query<{ name: string; max_hp: number; time_limit_sec: number }>(`SELECT name, max_hp, time_limit_sec FROM world_event_bosses WHERE id = $1`, [sched.rows[0].boss_id]);
  if (bossR.rowCount === 0) return;
  const boss = bossR.rows[0];
  await query(`INSERT INTO world_event_active (boss_id, current_hp, max_hp, ends_at) VALUES ($1, $2, $2, NOW() + INTERVAL '1 second' * $3)`, [sched.rows[0].boss_id, boss.max_hp, boss.time_limit_sec]);
  if (io) io.emit('world_event', { type: 'world_event_start', bossName: boss.name, endsAt: new Date(Date.now() + boss.time_limit_sec * 1000).toISOString() });
}

export async function checkExpiredWorldEvents(io?: Server) {
  const expired = await query<{ id: number }>(`SELECT id FROM world_event_active WHERE status = 'active' AND ends_at < NOW()`);
  for (const row of expired.rows) await finishEvent(row.id, 'expired', io);
  const defeated = await query<{ id: number }>(`SELECT id FROM world_event_active WHERE status = 'active' AND current_hp <= 0`);
  for (const row of defeated.rows) await finishEvent(row.id, 'defeated', io);
}
