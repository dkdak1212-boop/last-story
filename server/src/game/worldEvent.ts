import { query } from '../db/pool.js';
import { loadCharacter, getEffectiveStats } from './character.js';
import { addItemToInventory, deliverToMailbox } from './inventory.js';
import { applyExpGain } from './leveling.js';
import type { Server } from 'socket.io';

const ATTACK_COOLDOWN_MS = 10_000; // 10초 쿨다운
const DEATH_COOLDOWN_MS = 60_000; // 사망 시 1분 쿨다운

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

// ─── 10초 전투 시뮬레이션 ───
export async function attackBoss(characterId: number) {
  const event = await getActiveEvent();
  if (!event) return { error: '진행 중인 레이드가 없습니다.' };
  if (event.current_hp <= 0) return { error: '보스가 이미 쓰러졌습니다.' };

  const char = await loadCharacter(characterId);
  if (!char) return { error: '캐릭터를 찾을 수 없습니다.' };
  if (char.level < event.min_level) return { error: `Lv.${event.min_level} 이상만 참여 가능합니다.` };

  // 쿨다운 체크 (사망 시 1분, 일반 10초)
  const existing = await query<{ last_attack_at: string; last_death: boolean }>(
    `SELECT last_attack_at,
            COALESCE((SELECT TRUE FROM world_event_participants WHERE event_id = $1 AND character_id = $2 AND total_damage > 0), FALSE) AS last_death
     FROM world_event_participants WHERE event_id = $1 AND character_id = $2`,
    [event.id, characterId]
  );
  if (existing.rows[0]) {
    const elapsed = Date.now() - new Date(existing.rows[0].last_attack_at).getTime();
    // 사망 기록이 있으면 1분, 아니면 10초
    const cd = (char.hp <= 1) ? DEATH_COOLDOWN_MS : ATTACK_COOLDOWN_MS;
    if (elapsed < cd) {
      return { error: char.hp <= 1 ? '사망 쿨다운 중입니다.' : '쿨다운 중입니다.', cooldownMs: cd - elapsed };
    }
  }

  // 스탯 계산 (장비+노드+세트 전부 반영)
  const eff = await getEffectiveStats(char);
  const mageClass = ['mage', 'cleric'].includes(char.class_name);
  const playerAtk = mageClass ? eff.matk : eff.atk;
  const playerDef = eff.def;
  const playerMdef = eff.mdef;

  // 노드 패시브 로드
  const { getNodePassives } = await import('./character.js');
  const passives = await getNodePassives(characterId);
  const passiveMap = new Map(passives.map(p => [p.key, p.value]));
  const armorPierce = passiveMap.get('armor_pierce') || 0;
  const spellAmp = mageClass ? (passiveMap.get('spell_amp') || 0) : 0;
  const critDmgBonus = passiveMap.get('crit_damage') || 0;
  const cdReduce = passiveMap.get('cooldown_reduce') || 0;

  // 장비 접두사 특수 효과 로드
  const prefixR = await query<{ enhance_level: number; prefix_stats: Record<string, number> | null }>(
    `SELECT ce.enhance_level, ce.prefix_stats FROM character_equipped ce WHERE ce.character_id = $1`, [characterId]
  );
  const equipPrefixes: Record<string, number> = {};
  for (const row of prefixR.rows) {
    if (!row.prefix_stats) continue;
    const mult = 1 + (row.enhance_level || 0) * 0.08;
    for (const [k, v] of Object.entries(row.prefix_stats)) {
      equipPrefixes[k] = (equipPrefixes[k] || 0) + Math.round((v as number) * mult);
    }
  }
  const prefixDefReduce = equipPrefixes.def_reduce_pct || 0;
  const prefixLifesteal = equipPrefixes.lifesteal_pct || 0;
  const prefixCritDmg = equipPrefixes.crit_dmg_pct || 0;
  const prefixHpRegen = equipPrefixes.hp_regen || 0;

  // 스킬 로드 (auto_use ON인 스킬 전부)
  const skillsR = await query<{ name: string; kind: string; damage_mult: number; cooldown_actions: number; flat_damage: number; effect_type: string; effect_value: number }>(
    `SELECT s.name, s.kind, s.damage_mult, s.cooldown_actions, s.flat_damage, s.effect_type, s.effect_value
     FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
     WHERE cs.character_id = $1 AND cs.auto_use = TRUE AND s.required_level <= $2
     ORDER BY s.damage_mult DESC`,
    [characterId, char.level]
  );
  const allSkills = skillsR.rows;
  const dmgSkills = allSkills.filter(s => s.kind === 'damage');
  const healSkills = allSkills.filter(s => s.effect_type === 'heal_pct');
  const buffSkills = allSkills.filter(s => s.kind === 'buff' && s.effect_type !== 'heal_pct');

  // 보스 스탯 (플레이어 maxHp 기준으로 밸런싱 — 10초에 3~4대 맞으면 죽을 정도)
  const bossAtk = Math.round((eff.maxHp * 0.08 + event.level * 2) * 1.5);
  const baseBossDef = event.level * 2 * 3;
  const bossSpd = 250 + event.level * 3;

  // 페이즈별 보스 강화
  const hpPct = event.current_hp / event.max_hp;
  const phase = hpPct > 0.6 ? 1 : hpPct > 0.3 ? 2 : 3;
  const bossAtkMult = phase === 1 ? 1.0 : phase === 2 ? 1.5 : 2.0;
  const bossDefMult = phase === 1 ? 1.0 : phase === 2 ? 1.0 : 0.8;

  // 보스 방어력 (접두사 약화 + 노드 관통 적용)
  const totalPierce = Math.min(80, armorPierce + prefixDefReduce);
  const bossDef = Math.round(baseBossDef * bossDefMult * (1 - totalPierce / 100));

  // ── 10초 시뮬레이션 (100ms 틱) ──
  const GAUGE_MAX = 1000;
  const TICKS = 100; // 10초 = 100틱
  // 플레이어 HP: 장비/노드/세트 반영된 maxHp 기준 (전투 시작 시 풀HP)
  let playerHp = eff.maxHp;
  let playerGauge = 0;
  let bossGauge = 0;
  let totalDmgDealt = 0;
  let totalDmgReceived = 0;
  let critCount = 0;
  let actionCount = 0;
  let playerDead = false;
  const cooldowns = new Map<string, number>();
  const combatLog: string[] = [];

  for (let t = 0; t < TICKS; t++) {
    // 게이지 충전
    playerGauge += eff.spd * 0.2;
    bossGauge += bossSpd * 0.2;

    // 플레이어 행동
    if (playerGauge >= GAUGE_MAX) {
      playerGauge = 0;
      actionCount++;

      // 쿨다운 감소
      for (const [name, cd] of cooldowns) {
        if (cd <= 1) cooldowns.delete(name);
        else cooldowns.set(name, cd - 1);
      }

      // HP 낮으면 힐 스킬 우선
      let used = false;
      if (playerHp < eff.maxHp * 0.4) {
        for (const sk of healSkills) {
          if ((cooldowns.get(sk.name) ?? 0) > 0) continue;
          const heal = Math.round(eff.maxHp * sk.effect_value / 100);
          playerHp = Math.min(eff.maxHp, playerHp + heal);
          if (sk.cooldown_actions > 0) cooldowns.set(sk.name, sk.cooldown_actions);
          if (combatLog.length < 20) combatLog.push(`[${sk.name}] HP +${heal.toLocaleString()} 회복`);
          used = true;
          break;
        }
      }

      // 버프 스킬 (쿨다운 안 걸린 것 하나)
      if (!used) {
        for (const sk of buffSkills) {
          if ((cooldowns.get(sk.name) ?? 0) > 0) continue;
          if (sk.cooldown_actions > 0) cooldowns.set(sk.name, sk.cooldown_actions);
          if (combatLog.length < 20) combatLog.push(`[${sk.name}] 버프 발동!`);
          // 버프 효과: 간단히 다음 공격에 보너스 (시뮬레이션이라 직접 적용)
          used = true;
          break;
        }
      }

      // 공격 스킬
      if (!used) {
        for (const sk of dmgSkills) {
          if ((cooldowns.get(sk.name) ?? 0) > 0) continue;
          const isCrit = Math.random() * 100 < eff.cri;
          let dmg = Math.round((playerAtk - bossDef * 0.5) * sk.damage_mult * (0.9 + Math.random() * 0.2)) + (sk.flat_damage || 0);
          dmg = Math.max(1, dmg);
          // 마법 증폭
          if (spellAmp > 0) dmg = Math.round(dmg * (1 + spellAmp / 100));
          // 치명타
          if (isCrit) {
            const totalCritBonus = 100 + critDmgBonus + prefixCritDmg;
            dmg = Math.round(dmg * (1 + totalCritBonus / 100));
            critCount++;
          }
          totalDmgDealt += dmg;
          // 흡혈
          if (prefixLifesteal > 0) playerHp = Math.min(eff.maxHp, playerHp + Math.round(dmg * prefixLifesteal / 1000));
          // 쿨다운 (노드 쿨감 적용)
          if (sk.cooldown_actions > 0) {
            const cd = Math.max(1, sk.cooldown_actions - Math.floor(cdReduce / 25));
            cooldowns.set(sk.name, cd);
          }
          if (combatLog.length < 20) combatLog.push(`[${sk.name}] ${dmg.toLocaleString()}${isCrit ? ' (치명타!)' : ''}`);
          used = true;
          break;
        }
      }

      // 기본 공격
      if (!used) {
        const isCrit = Math.random() * 100 < eff.cri;
        let dmg = Math.round((playerAtk - bossDef * 0.5) * (0.9 + Math.random() * 0.2));
        dmg = Math.max(1, dmg);
        if (isCrit) {
          const totalCritBonus = 100 + critDmgBonus + prefixCritDmg;
          dmg = Math.round(dmg * (1 + totalCritBonus / 100));
          critCount++;
        }
        totalDmgDealt += dmg;
        if (prefixLifesteal > 0) playerHp = Math.min(eff.maxHp, playerHp + Math.round(dmg * prefixLifesteal / 1000));
        if (combatLog.length < 20) combatLog.push(`[기본 공격] ${dmg.toLocaleString()}${isCrit ? ' (치명타!)' : ''}`);
      }

      // 접두사: 재생 (틱당 회복은 행동 시 적용)
      if (prefixHpRegen > 0 && playerHp < eff.maxHp) {
        playerHp = Math.min(eff.maxHp, playerHp + prefixHpRegen);
      }
    }

    // 보스 행동
    if (bossGauge >= GAUGE_MAX) {
      bossGauge = 0;
      // 보스 공격: 물리/마법 랜덤 (마법 30%)
      const bossUseMagic = Math.random() < 0.3;
      const bossRawAtk = bossAtk * bossAtkMult;
      const playerDefVal = bossUseMagic ? playerMdef : playerDef;
      // 플레이어 회피
      if (Math.random() * 100 < eff.dodge) {
        if (combatLog.length < 20) combatLog.push(`[회피] 보스 공격을 회피했다!`);
        continue;
      }

      let bossDmg = Math.round((bossRawAtk - playerDefVal * 0.5) * (0.9 + Math.random() * 0.2));
      bossDmg = Math.max(1, bossDmg);

      // P3 전체공격: 추가 데미지
      if (phase === 3 && Math.random() < 0.3) {
        const aoeDmg = Math.round(eff.maxHp * 0.08);
        bossDmg += aoeDmg;
        totalDmgReceived += bossDmg;
        playerHp -= bossDmg;
        if (combatLog.length < 20) combatLog.push(`[보스 전체공격] ${bossDmg.toLocaleString()} (HP: ${Math.max(0, playerHp).toLocaleString()}/${eff.maxHp.toLocaleString()})`);
      } else {
        totalDmgReceived += bossDmg;
        playerHp -= bossDmg;
        if (combatLog.length < 20) combatLog.push(`[보스 공격] ${bossDmg.toLocaleString()} (HP: ${Math.max(0, playerHp).toLocaleString()}/${eff.maxHp.toLocaleString()})`);
      }

      if (playerHp <= 0) {
        playerDead = true;
        combatLog.push('[사망] 보스에게 쓰러졌다!');
        break;
      }
    }
  }

  // HP 업데이트 (사망 시 HP 1)
  const newPlayerHp = playerDead ? 1 : Math.max(1, playerHp);
  await query('UPDATE characters SET hp = $1 WHERE id = $2', [newPlayerHp, characterId]);

  // 보스 공유 HP 감소
  const upd = await query<{ current_hp: number }>(
    `UPDATE world_event_active SET current_hp = GREATEST(0, current_hp - $1) WHERE id = $2 AND status = 'active' RETURNING current_hp`,
    [totalDmgDealt, event.id]
  );
  const newBossHp = upd.rows[0]?.current_hp ?? event.current_hp;

  // 참여자 업서트
  await query(
    `INSERT INTO world_event_participants (event_id, character_id, total_damage, attack_count, last_attack_at)
     VALUES ($1, $2, $3, 1, NOW())
     ON CONFLICT (event_id, character_id) DO UPDATE
     SET total_damage = world_event_participants.total_damage + $3,
         attack_count = world_event_participants.attack_count + 1,
         last_attack_at = NOW()`,
    [event.id, characterId, totalDmgDealt]
  );

  // 내 순위
  const myRow = await query<{ total_damage: number; attack_count: number; rank: number }>(
    `SELECT total_damage, attack_count,
            (SELECT COUNT(*) + 1 FROM world_event_participants p2
             WHERE p2.event_id = $1 AND p2.total_damage > p.total_damage)::int AS rank
     FROM world_event_participants p WHERE event_id = $1 AND character_id = $2`,
    [event.id, characterId]
  );
  const my = myRow.rows[0];

  return {
    damageDealt: totalDmgDealt,
    damageReceived: totalDmgReceived,
    actionCount,
    critCount,
    playerDead,
    playerHp: newPlayerHp,
    playerMaxHp: eff.maxHp,
    phase,
    combatLog,
    currentHp: newBossHp,
    maxHp: event.max_hp,
    myDamage: my?.total_damage ?? totalDmgDealt,
    myRank: my?.rank ?? 1,
    myAttackCount: my?.attack_count ?? 1,
    defeated: newBossHp <= 0,
  };
}

// ─── 리더보드 ───
export async function getLeaderboard(eventId: number, limit = 20) {
  const r = await query<{ character_name: string; class_name: string; total_damage: number }>(
    `SELECT c.name AS character_name, c.class_name, p.total_damage
     FROM world_event_participants p JOIN characters c ON c.id = p.character_id
     JOIN users u ON u.id = c.user_id
     WHERE p.event_id = $1 AND u.is_admin = FALSE
     ORDER BY p.total_damage DESC LIMIT $2`,
    [eventId, limit]
  );
  return r.rows.map((row, i) => ({ rank: i + 1, characterName: row.character_name, className: row.class_name, damage: row.total_damage }));
}

// ─── 보상 분배 ───
async function distributeRewards(eventId: number, mult: number = 1.0) {
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
    const goldAmt = rw.gold ? Math.round(rw.gold * mult) : 0;
    const expAmt = rw.exp ? Math.round(rw.exp * mult) : 0;
    if (goldAmt) await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [goldAmt, p.character_id]);
    if (expAmt) {
      const cr = await query<{ level: number; exp: string; class_name: string }>('SELECT level, exp, class_name FROM characters WHERE id = $1', [p.character_id]);
      if (cr.rows[0]) {
        const result = applyExpGain(cr.rows[0].level, Number(cr.rows[0].exp), expAmt, cr.rows[0].class_name);
        const g = result.statGrowth;
        await query(
          `UPDATE characters SET level=$1, exp=$2, max_hp=max_hp+$3, node_points=node_points+$4,
           stats = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(stats,
             '{str}',(COALESCE((stats->>'str')::int,0)+$6)::text::jsonb),'{dex}',(COALESCE((stats->>'dex')::int,0)+$7)::text::jsonb),
             '{int}',(COALESCE((stats->>'int')::int,0)+$8)::text::jsonb),'{vit}',(COALESCE((stats->>'vit')::int,0)+$9)::text::jsonb),
             '{spd}',(COALESCE((stats->>'spd')::int,0)+$10)::text::jsonb),'{cri}',(COALESCE((stats->>'cri')::int,0)+$11)::text::jsonb)
           WHERE id=$5`,
          [result.newLevel, result.newExp, result.hpGained, result.nodePointsGained, p.character_id, g.str, g.dex, g.int, g.vit, g.spd, g.cri]
        );
      }
    }
    if (rw.itemId && rw.qty) {
      const { overflow } = await addItemToInventory(p.character_id, rw.itemId, rw.qty);
      if (overflow > 0) await deliverToMailbox(p.character_id, `레이드 보상 (${matched.tier})`, '우편 발송', rw.itemId, overflow);
    }
    const partial = mult < 1.0 ? ' [시간만료 50%]' : '';
    await deliverToMailbox(p.character_id, `레이드 보상 (${matched.tier}등급)${partial}`,
      `순위 ${rank}위 · 데미지 ${p.total_damage.toLocaleString()}\n보상: ${goldAmt.toLocaleString()}G, 경험치 ${expAmt.toLocaleString()}`, 0, 0, 0);
  }
}

// ─── 보스 처치/만료 ───
export async function finishEvent(eventId: number, status: 'defeated' | 'expired', io?: Server) {
  await query(`UPDATE world_event_active SET status = $1, finished_at = NOW() WHERE id = $2`, [status, eventId]);
  const boss = await query<{ name: string }>(`SELECT b.name FROM world_event_active e JOIN world_event_bosses b ON b.id = e.boss_id WHERE e.id = $1`, [eventId]);
  // 처치/만료 모두 100% 보상
  await distributeRewards(eventId, 1.0);
  if (io) io.emit('world_event', { type: 'world_event_end', bossName: boss.rows[0]?.name ?? '???', result: status });
}

// ─── 스케줄러 ───
export async function checkAndSpawnWorldEvent(io?: Server) {
  const active = await getActiveEvent(); if (active) return;
  const now = new Date();
  const hour = now.getUTCHours();
  const kstDay = new Date(now.getTime() + 9 * 3600000).getDay(); // 0=일 1=월 2=화 3=수 4=목 5=금 6=토
  const sched = await query<{ boss_id: number }>(`SELECT boss_id FROM world_event_schedule WHERE hour_utc = $1 AND enabled = TRUE LIMIT 1`, [hour]);
  if (sched.rowCount === 0) return;
  // 아트라스(boss_id=2): 수(3), 토(6)에만 등장
  if (sched.rows[0].boss_id === 2 && kstDay !== 3 && kstDay !== 6) return;
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
