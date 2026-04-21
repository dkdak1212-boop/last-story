// 길드 보스 공용 헬퍼 — 엔진 + 라우트에서 공유
import { query } from '../db/pool.js';

export const ELEMENTS = ['fire', 'frost', 'lightning', 'earth', 'holy', 'dark'];

export const THRESHOLD_COPPER = 100_000_000n;
export const THRESHOLD_SILVER = 500_000_000n;
export const THRESHOLD_GOLD = 1_000_000_000n;

// 단일 run이 임계값을 돌파 → 길드원 전원에게 해당 티어 상자 배포 (일일 1회 per tier)
export const GUILD_TIER_MILESTONES: { bit: number; damage: bigint; tier: 'copper' | 'silver' | 'gold'; subject: string }[] = [
  { bit: 1, damage: 100_000_000n,   tier: 'copper', subject: '길드 보스 — 구리 상자 (길드원 보상)' },
  { bit: 2, damage: 500_000_000n,   tier: 'silver', subject: '길드 보스 — 은빛 상자 (길드원 보상)' },
  { bit: 4, damage: 1_000_000_000n, tier: 'gold',   subject: '길드 보스 — 황금빛 상자 (길드원 보상)' },
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
 * 한 덩어리 raw 데미지에 보스 메커닉(원소 면역/약점, 도트 면역, 교대 면역, HP 회복)을 적용해
 * effective 데미지를 계산하고 guild_boss_runs.total_damage / guild_boss_guild_daily.total_hits를 업데이트.
 * 반환: { effective, recovered, applied }
 */
export async function applyDamageToRun(
  runId: string,
  rawDamage: number,
  hits: number,
  meta: DamageMeta
): Promise<{ effective: number; recovered: number; applied: string[] }> {
  const applied: string[] = [];

  if (rawDamage <= 0 && hits <= 0) return { effective: 0, recovered: 0, applied };
  // 연습 모드 — DB run 없음. BigInt 파싱 에러 방어차 조기 탈출.
  if (runId.startsWith('practice-')) return { effective: 0, recovered: 0, applied };

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
    return { effective: 0, recovered: 0, applied };
  }
  const run = runR.rows[0];

  const boss = await getBossById(run.boss_id);
  if (!boss) return { effective: 0, recovered: 0, applied };

  const damageType = meta.damageType === 'magical' ? 'magical' : 'physical';
  const element = typeof meta.element === 'string' ? meta.element : null;
  const isDot = !!meta.isDot;

  let effective = rawDamage;

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

  // 3) 차원 지배자 — ATK/MATK 교대 면역 (상시)
  if (effective > 0 && boss.alternating_immune) {
    const phase = Math.floor(Date.now() / 1000 / 30) % 2;
    if ((phase === 0 && damageType === 'physical') || (phase === 1 && damageType === 'magical')) {
      effective = 0; applied.push(`${damageType === 'physical' ? 'ATK' : 'MATK'} 면역 페이즈 (0)`);
    }
  }

  // 4) 시계태엽 거인 HP 회복 (lazy, 상시)
  let recovered = 0;
  if (boss.hp_recover_pct > 0 && boss.hp_recover_interval_sec > 0) {
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

  // 길드 일일 누적 — damage + hits 실시간 반영. (exit 시점까지 기다리지 않고
  // 진행 중에도 길드 누적 UI가 업데이트 되도록.)
  if (run.guild_id && (finalEffective > 0 || hits > 0)) {
    const today = await todayKst();
    await query(
      `INSERT INTO guild_boss_guild_daily (guild_id, date, total_damage, total_hits)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (guild_id, date) DO UPDATE
         SET total_damage = guild_boss_guild_daily.total_damage + EXCLUDED.total_damage,
             total_hits   = guild_boss_guild_daily.total_hits   + EXCLUDED.total_hits`,
      [run.guild_id, today, finalEffective, hits]
    );
  }

  // 캐릭터 일일 누적 — MVP 선정용 실시간 반영
  if (finalEffective > 0) {
    const today = await todayKst();
    await query(
      `UPDATE guild_boss_daily SET daily_damage_total = daily_damage_total + $1
       WHERE character_id = $2 AND date = $3`,
      [finalEffective, run.character_id, today]
    );
  }

  return { effective: finalEffective, recovered, applied };
}

/**
 * run을 종료하고 티어 판정 — 엔진에서 플레이어 사망 시 호출.
 * 상자 지급은 라우트의 exit 엔드포인트에서 이루어지므로, 여기서는 단순히 상태만 마감한다.
 * (상자 지급 로직을 여기서 중복 실행하지 않기 위해 run은 ended_at만 세팅, 실제 보상은 클라이언트가 exit 호출 시 받음)
 * 엔진에서 사망으로 종료 시 이후 플레이어가 /guild-boss/exit를 호출하면 이미 ended_at이 있어 상자는 그 시점에 지급되지 않음.
 * 대신, 엔진에서 사망 시 직접 상자 지급까지 해야 함. → route에 dispatchChest 함수를 export.
 */
export async function markRunEndedByEngine(runId: string, reason: 'death' | 'logout'): Promise<{ totalDamage: bigint; tier: 'gold' | 'silver' | 'copper' | null; thresholdsPassed: number }> {
  // 연습 모드 세션은 DB run 이 없는 임시 ID ('practice-<char>-<ts>') — 스킵.
  if (runId.startsWith('practice-')) return { totalDamage: 0n, tier: null, thresholdsPassed: 0 };
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
