// 길드 보스 공용 헬퍼 — 엔진 + 라우트에서 공유
import { query } from '../db/pool.js';

export const ELEMENTS = ['fire', 'frost', 'lightning', 'earth', 'holy', 'dark'];
export const WEAKPOINT_PERIOD_SEC = 30 * 60;
export const WEAKPOINT_WINDOW_SEC = 30;
export const WEAKPOINT_MULT = 3;
export const DEBUFF_HITS_PER_PERCENT = 10_000;
export const DEBUFF_CAP_PCT = 50;

export const THRESHOLD_COPPER = 100_000_000n;
export const THRESHOLD_SILVER = 500_000_000n;
export const THRESHOLD_GOLD = 1_000_000_000n;

export const FIRST_PASS_MEDALS_COPPER = 5;
export const FIRST_PASS_MEDALS_SILVER = 15;
export const FIRST_PASS_MEDALS_GOLD = 30;

export const GLOBAL_MILESTONES = [
  { bit: 1, damage: 10_000_000_000n,   kind: 'mini',   subject: '길드 보스 글로벌 — 미니 상자' },
  { bit: 2, damage: 50_000_000_000n,   kind: 'medium', subject: '길드 보스 글로벌 — 미디엄 상자' },
  { bit: 4, damage: 100_000_000_000n,  kind: 'mega',   subject: '길드 보스 글로벌 — 메가 상자' },
  { bit: 8, damage: 500_000_000_000n,  kind: 'buff',   subject: '길드 보스 글로벌 — 24시간 버프' },
];

export interface GuildBossData {
  id: number;
  name: string;
  weekday: number;
  description: string;
  appearance: string;
  base_def: number;
  base_mdef: number;
  base_dodge: number;
  base_atk: number;
  element_immune: string | null;
  element_weak: string | null;
  weak_amp_pct: number;
  dot_immune: boolean;
  hp_recover_pct: number;
  hp_recover_interval_sec: number;
  random_weakness: boolean;
  alternating_immune: boolean;
}

export function isWeakpointActive(): boolean {
  const nowSec = Math.floor(Date.now() / 1000);
  return (nowSec % WEAKPOINT_PERIOD_SEC) < WEAKPOINT_WINDOW_SEC;
}

export async function todayKst(): Promise<string> {
  const r = await query<{ d: string }>("SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date::text AS d");
  return r.rows[0].d;
}

export async function todayWeekday(): Promise<number> {
  const r = await query<{ w: number }>(
    "SELECT ((EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Asia/Seoul'))::int + 6) % 7) AS w"
  );
  return r.rows[0].w;
}

export async function getTodaysBoss(): Promise<GuildBossData | null> {
  const w = await todayWeekday();
  const r = await query<GuildBossData>('SELECT * FROM guild_bosses WHERE weekday = $1', [w]);
  return r.rows[0] ?? null;
}

export async function getBossById(id: number): Promise<GuildBossData | null> {
  const r = await query<GuildBossData>('SELECT * FROM guild_bosses WHERE id = $1', [id]);
  return r.rows[0] ?? null;
}

export interface DamageMeta {
  damageType?: 'physical' | 'magical';
  element?: string | null;
  isDot?: boolean;
}

/**
 * 한 덩어리 raw 데미지에 보스 메커닉을 적용해 effective 데미지를 계산하고
 * guild_boss_runs.total_damage / guild_boss_guild_daily.total_hits를 업데이트.
 * 반환: { effective, recovered, debuffPct, weakpointActive }
 */
export async function applyDamageToRun(
  runId: string,
  rawDamage: number,
  hits: number,
  meta: DamageMeta
): Promise<{ effective: number; recovered: number; debuffPct: number; weakpointActive: boolean; applied: string[] }> {
  const applied: string[] = [];

  if (rawDamage <= 0 && hits <= 0) return { effective: 0, recovered: 0, debuffPct: 0, weakpointActive: false, applied };

  const runR = await query<{
    character_id: number; guild_id: number | null; boss_id: number; ended_at: string | null;
    total_damage: string; started_at: string;
    random_weak_element: string | null; last_recover_at: string | null;
  }>(
    `SELECT character_id, guild_id, boss_id, ended_at, total_damage::text,
            started_at::text, random_weak_element, last_recover_at::text
     FROM guild_boss_runs WHERE id = $1`, [runId]
  );
  if (!runR.rowCount || runR.rows[0].ended_at) {
    return { effective: 0, recovered: 0, debuffPct: 0, weakpointActive: false, applied };
  }
  const run = runR.rows[0];

  const boss = await getBossById(run.boss_id);
  if (!boss) return { effective: 0, recovered: 0, debuffPct: 0, weakpointActive: false, applied };

  const damageType = meta.damageType === 'magical' ? 'magical' : 'physical';
  const element = typeof meta.element === 'string' ? meta.element : null;
  const isDot = !!meta.isDot;

  let effective = rawDamage;
  const weakpointActive = isWeakpointActive();

  // 1) 도트 면역
  if (boss.dot_immune && isDot) { effective = 0; applied.push('도트 면역 (0)'); }

  // 2) 원소 면역 / 약점
  if (effective > 0 && element) {
    if (boss.element_immune === element) {
      effective = 0; applied.push(`${element} 면역 (0)`);
    } else {
      const weakElement = boss.random_weakness ? run.random_weak_element : boss.element_weak;
      if (weakElement === element && boss.weak_amp_pct > 0) {
        effective = effective * (1 + boss.weak_amp_pct / 100);
        applied.push(`${element} 약점 +${boss.weak_amp_pct}%`);
      }
    }
  }

  // 3) 차원 지배자 — ATK/MATK 교대 면역 (약점시간대 예외)
  if (effective > 0 && boss.alternating_immune && !weakpointActive) {
    const phase = Math.floor(Date.now() / 1000 / 30) % 2;
    if ((phase === 0 && damageType === 'physical') || (phase === 1 && damageType === 'magical')) {
      effective = 0; applied.push(`${damageType === 'physical' ? 'ATK' : 'MATK'} 면역 페이즈 (0)`);
    }
  }

  // 4) 누적 디버프
  let debuffPct = 0;
  if (effective > 0 && run.guild_id) {
    const today = await todayKst();
    const hitR = await query<{ total_hits: string }>(
      'SELECT total_hits::text FROM guild_boss_guild_daily WHERE guild_id = $1 AND date = $2',
      [run.guild_id, today]
    );
    const totalHits = hitR.rows[0] ? Number(hitR.rows[0].total_hits) : 0;
    debuffPct = Math.min(DEBUFF_CAP_PCT, Math.floor(totalHits / DEBUFF_HITS_PER_PERCENT));
    if (debuffPct > 0) {
      effective = effective * (1 + debuffPct / 100);
      applied.push(`누적 디버프 +${debuffPct}%`);
    }
  }

  // 5) 약점 시간대 ×3
  if (effective > 0 && weakpointActive) {
    effective = effective * WEAKPOINT_MULT;
    applied.push(`약점 시간대 ×${WEAKPOINT_MULT}`);
  }

  // 6) 시계태엽 거인 HP 회복 (lazy)
  let recovered = 0;
  if (boss.hp_recover_pct > 0 && boss.hp_recover_interval_sec > 0 && !weakpointActive) {
    const lastRecAt = run.last_recover_at ? new Date(run.last_recover_at).getTime() : new Date(run.started_at).getTime();
    const intervals = Math.floor((Date.now() - lastRecAt) / 1000 / boss.hp_recover_interval_sec);
    if (intervals > 0) {
      const curTotal = Number(run.total_damage);
      recovered = Math.floor(curTotal * (boss.hp_recover_pct / 100) * intervals);
      if (recovered > 0) {
        applied.push(`HP 회복 -${recovered}`);
        await query(
          `UPDATE guild_boss_runs
           SET total_damage = GREATEST(0, total_damage - $1),
               last_recover_at = last_recover_at + ($2 * INTERVAL '1 second')
           WHERE id = $3`,
          [recovered, intervals * boss.hp_recover_interval_sec, runId]
        );
      }
    }
  }

  const finalEffective = Math.floor(effective);

  if (finalEffective > 0) {
    await query(
      'UPDATE guild_boss_runs SET total_damage = total_damage + $1 WHERE id = $2',
      [finalEffective, runId]
    );
  }

  if (hits > 0 && run.guild_id) {
    const today = await todayKst();
    await query(
      `INSERT INTO guild_boss_guild_daily (guild_id, date, total_hits)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, date) DO UPDATE SET total_hits = guild_boss_guild_daily.total_hits + $3`,
      [run.guild_id, today, hits]
    );
  }

  return { effective: finalEffective, recovered, debuffPct, weakpointActive, applied };
}

/**
 * run을 종료하고 티어 판정 — 엔진에서 플레이어 사망 시 호출.
 * 상자 지급은 라우트의 exit 엔드포인트에서 이루어지므로, 여기서는 단순히 상태만 마감한다.
 * (상자 지급 로직을 여기서 중복 실행하지 않기 위해 run은 ended_at만 세팅, 실제 보상은 클라이언트가 exit 호출 시 받음)
 * 엔진에서 사망으로 종료 시 이후 플레이어가 /guild-boss/exit를 호출하면 이미 ended_at이 있어 상자는 그 시점에 지급되지 않음.
 * 대신, 엔진에서 사망 시 직접 상자 지급까지 해야 함. → route에 dispatchChest 함수를 export.
 */
export async function markRunEndedByEngine(runId: string, reason: 'death' | 'logout'): Promise<{ totalDamage: bigint; tier: 'gold' | 'silver' | 'copper' | null; thresholdsPassed: number }> {
  const runR = await query<{ total_damage: string; ended_at: string | null }>(
    'SELECT total_damage::text, ended_at FROM guild_boss_runs WHERE id = $1', [runId]
  );
  if (!runR.rowCount || runR.rows[0].ended_at) return { totalDamage: 0n, tier: null, thresholdsPassed: 0 };

  const totalDamage = BigInt(runR.rows[0].total_damage);
  let tier: 'gold' | 'silver' | 'copper' | null = null;
  if (totalDamage >= THRESHOLD_GOLD) tier = 'gold';
  else if (totalDamage >= THRESHOLD_SILVER) tier = 'silver';
  else if (totalDamage >= THRESHOLD_COPPER) tier = 'copper';

  let thresholdsPassed = 0;
  if (totalDamage >= THRESHOLD_COPPER) thresholdsPassed |= 1;
  if (totalDamage >= THRESHOLD_SILVER) thresholdsPassed |= 2;
  if (totalDamage >= THRESHOLD_GOLD) thresholdsPassed |= 4;

  await query(
    'UPDATE guild_boss_runs SET ended_at = NOW(), reward_tier = $1, thresholds_passed = $2, ended_reason = $3 WHERE id = $4',
    [tier, thresholdsPassed, reason, runId]
  );
  return { totalDamage, tier, thresholdsPassed };
}
