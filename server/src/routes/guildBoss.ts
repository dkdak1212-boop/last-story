// 길드 보스 시스템 Phase 1~4 — 입장 / 데미지 누적 / 퇴장 / 상자 지급
import { Router, type Response } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { adminRequired } from '../middleware/admin.js';
import { loadCharacterOwned } from '../game/character.js';
import { applyExpGain } from '../game/leveling.js';
import { addItemToInventory, deliverToMailbox } from '../game/inventory.js';
import { startGuildBossCombatSession, endGuildBossCombatSession } from '../combat/engine.js';
import { getBossById } from '../combat/guildBossHelpers.js';

const router = Router();
router.use(authRequired);
// 테스트 단계 — 관리자만 접근 허용 (정식 오픈 시 제거)
router.use(adminRequired);

// 아이템 ID (라이브 DB 조회 결과 기반)
const ITEM_ENHANCE_SCROLL = 286;      // 강화 성공률 스크롤
const ITEM_PREFIX_REROLL = 322;       // 접두사 수치 재굴림권
const ITEM_QUALITY_REROLL = 476;      // 품질 재굴림권 (migration 031)

// 캐릭 레벨 기준 유니크 풀에서 무작위 1개 선택
async function pickRandomUnique(characterLevel: number): Promise<number | null> {
  const low = Math.max(1, characterLevel - 10);
  const high = characterLevel + 10;
  const r = await query<{ id: number }>(
    `SELECT id FROM items
     WHERE grade = 'unique' AND required_level BETWEEN $1 AND $2
     ORDER BY RANDOM() LIMIT 1`,
    [low, high]
  );
  return r.rows[0]?.id ?? null;
}

// 데미지 임계값 (단위: 실제 입힌 데미지)
const THRESHOLD_COPPER = 100_000_000;      // 1억
const THRESHOLD_SILVER = 500_000_000;      // 5억
const THRESHOLD_GOLD = 1_000_000_000;      // 10억

// 첫 통과 메달 보너스
const FIRST_PASS_MEDALS_COPPER = 5;
const FIRST_PASS_MEDALS_SILVER = 15;
const FIRST_PASS_MEDALS_GOLD = 30;

// 보스 메커닉 상수
const WEAKPOINT_PERIOD_SEC = 30 * 60;       // 30분 주기
const WEAKPOINT_WINDOW_SEC = 30;            // 30초간 활성
const WEAKPOINT_MULT = 3;                   // 약점 시간대 ×3
const DEBUFF_HITS_PER_PERCENT = 10_000;     // 1만 타격당 보스 방어 -1%
const DEBUFF_CAP_PCT = 50;                  // 캡 -50%
const ELEMENTS = ['fire', 'frost', 'lightning', 'earth', 'holy', 'dark'];

// 단일 run이 임계값을 넘으면 길드원 전원에게 해당 티어 상자 배포 (일일 1회/티어)
const GUILD_TIER_MILESTONES: { bit: number; damage: bigint; tier: 'copper' | 'silver' | 'gold'; subject: string }[] = [
  { bit: 1, damage: 100_000_000n,   tier: 'copper', subject: '길드 보스 — 구리 상자 (길드원 보상)' },
  { bit: 2, damage: 500_000_000n,   tier: 'silver', subject: '길드 보스 — 은빛 상자 (길드원 보상)' },
  { bit: 4, damage: 1_000_000_000n, tier: 'gold',   subject: '길드 보스 — 황금빛 상자 (길드원 보상)' },
];

// 오늘 날짜 (KST)
async function todayKst(): Promise<string> {
  const r = await query<{ d: string }>("SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date::text AS d");
  return r.rows[0].d;
}

// 오늘 요일 (KST, 0=월 ~ 6=일)
async function todayWeekday(): Promise<number> {
  const r = await query<{ w: number }>(
    "SELECT ((EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Asia/Seoul'))::int + 6) % 7) AS w"
  );
  return r.rows[0].w;
}

async function getCharacterGuildId(characterId: number): Promise<number | null> {
  const r = await query<{ guild_id: number }>(
    'SELECT guild_id FROM guild_members WHERE character_id = $1 LIMIT 1',
    [characterId]
  );
  return r.rows[0]?.guild_id ?? null;
}

// 일일 키/데미지 row 확보 (없으면 생성)
async function ensureDailyRow(characterId: number): Promise<{ keys_remaining: number; daily_damage_total: string }> {
  const today = await todayKst();
  await query(
    `INSERT INTO guild_boss_daily (character_id, date, keys_remaining, daily_damage_total)
     VALUES ($1, $2, 2, 0) ON CONFLICT (character_id, date) DO NOTHING`,
    [characterId, today]
  );
  const r = await query<{ keys_remaining: number; daily_damage_total: string }>(
    'SELECT keys_remaining, daily_damage_total FROM guild_boss_daily WHERE character_id = $1 AND date = $2',
    [characterId, today]
  );
  return r.rows[0];
}

// 오늘의 보스 조회
async function getTodaysBoss() {
  const w = await todayWeekday();
  const r = await query<{
    id: number; name: string; description: string; appearance: string;
    base_def: number; base_mdef: number; base_dodge: number; base_atk: number;
    element_immune: string | null; element_weak: string | null; weak_amp_pct: number;
    dot_immune: boolean; hp_recover_pct: number; hp_recover_interval_sec: number;
    random_weakness: boolean; alternating_immune: boolean;
  }>('SELECT * FROM guild_bosses WHERE weekday = $1', [w]);
  return r.rows[0] ?? null;
}

// ============================================================
// GET /guild-boss/state/:characterId — 상태 조회
// ============================================================
router.get('/state/:characterId', async (req: AuthedRequest, res: Response) => {
  const characterId = Number(req.params.characterId);
  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'character not found' });

  const guildId = await getCharacterGuildId(characterId);
  if (!guildId) return res.status(403).json({ error: '길드 가입 필요' });

  const boss = await getTodaysBoss();
  if (!boss) return res.status(500).json({ error: '오늘의 보스 설정 없음' });

  const daily = await ensureDailyRow(characterId);
  const today = await todayKst();
  const activeRun = await query<{ id: string; total_damage: string; started_at: string }>(
    `SELECT id::text, total_damage::text, started_at::text FROM guild_boss_runs
     WHERE character_id = $1 AND ended_at IS NULL
     ORDER BY started_at DESC LIMIT 1`,
    [characterId]
  );
  const guildDaily = await query<{ total_damage: string; global_chest_milestones: number }>(
    'SELECT total_damage::text, global_chest_milestones FROM guild_boss_guild_daily WHERE guild_id = $1 AND date = $2',
    [guildId, today]
  );

  res.json({
    boss,
    keysRemaining: daily.keys_remaining,
    dailyDamageTotal: daily.daily_damage_total,
    guildMedals: (char as { guild_boss_medals?: number }).guild_boss_medals ?? 0,
    activeRun: activeRun.rows[0] ?? null,
    guildDaily: guildDaily.rows[0] ?? { total_damage: '0', global_chest_milestones: 0 },
  });
});

// ============================================================
// GET /guild-boss/rankings — 전체 길드 순위 + 각 길드별 MVP
// ============================================================
router.get('/rankings', async (_req: AuthedRequest, res: Response) => {
  const today = await todayKst();
  // 길드별 일일 총 데미지 상위 20
  const guildR = await query<{ guild_id: number; guild_name: string; total_damage: string; member_count: number }>(
    `SELECT gbd.guild_id, g.name AS guild_name, gbd.total_damage::text,
            COALESCE((SELECT COUNT(*)::int FROM guild_members gm WHERE gm.guild_id = gbd.guild_id), 0) AS member_count
     FROM guild_boss_guild_daily gbd
     JOIN guilds g ON g.id = gbd.guild_id
     WHERE gbd.date = $1 AND gbd.total_damage > 0
     ORDER BY gbd.total_damage DESC
     LIMIT 20`,
    [today]
  );

  // 각 길드별 MVP (캐릭 누적 데미지 최대)
  const mvps: Record<number, { characterId: number; name: string; className: string; level: number; damage: string }> = {};
  if (guildR.rowCount && guildR.rowCount > 0) {
    const guildIds = guildR.rows.map(g => g.guild_id);
    const mvpR = await query<{ guild_id: number; character_id: number; name: string; class_name: string; level: number; damage: string }>(
      `SELECT DISTINCT ON (gm.guild_id)
              gm.guild_id, c.id AS character_id, c.name, c.class_name, c.level, gbd.daily_damage_total::text AS damage
       FROM guild_boss_daily gbd
       JOIN characters c ON c.id = gbd.character_id
       JOIN guild_members gm ON gm.character_id = c.id
       WHERE gbd.date = $1 AND gm.guild_id = ANY($2::int[])
       ORDER BY gm.guild_id, gbd.daily_damage_total DESC`,
      [today, guildIds]
    );
    for (const m of mvpR.rows) {
      mvps[m.guild_id] = {
        characterId: m.character_id, name: m.name, className: m.class_name,
        level: m.level, damage: m.damage,
      };
    }
  }

  res.json({
    guilds: guildR.rows.map(g => ({
      guildId: g.guild_id,
      guildName: g.guild_name,
      totalDamage: g.total_damage,
      memberCount: g.member_count,
      mvp: mvps[g.guild_id] ?? null,
    })),
  });
});

// ============================================================
// POST /guild-boss/enter/:characterId — 입장 (키 1개 소모, 새 run 생성)
// ============================================================
router.post('/enter/:characterId', async (req: AuthedRequest, res: Response) => {
  const characterId = Number(req.params.characterId);
  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'character not found' });

  const guildId = await getCharacterGuildId(characterId);
  if (!guildId) return res.status(403).json({ error: '길드 가입 필요' });

  const boss = await getTodaysBoss();
  if (!boss) return res.status(500).json({ error: '오늘의 보스 설정 없음' });

  const daily = await ensureDailyRow(characterId);
  if (daily.keys_remaining <= 0) return res.status(400).json({ error: '오늘 입장키 없음' });

  // 이미 진행 중인 run 있는지
  const ongoing = await query(
    `SELECT id FROM guild_boss_runs WHERE character_id = $1 AND ended_at IS NULL`,
    [characterId]
  );
  if (ongoing.rowCount && ongoing.rowCount > 0) {
    return res.status(400).json({ error: '이미 진행 중인 입장 있음' });
  }

  const today = await todayKst();
  // 원자적 키 차감 + run 생성
  // 천공의 용(random_weakness)은 입장 시 약점 원소 무작위 배정
  const randomWeak = boss.random_weakness ? ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)] : null;

  const r = await query<{ id: string }>(
    `WITH dec AS (
       UPDATE guild_boss_daily SET keys_remaining = keys_remaining - 1
       WHERE character_id = $1 AND date = $2 AND keys_remaining > 0
       RETURNING keys_remaining
     )
     INSERT INTO guild_boss_runs (character_id, guild_id, boss_id, random_weak_element, last_recover_at)
     SELECT $1, $3, $4, $5, NOW() WHERE EXISTS (SELECT 1 FROM dec)
     RETURNING id::text`,
    [characterId, today, guildId, boss.id, randomWeak]
  );
  if (!r.rowCount) return res.status(400).json({ error: '키 차감 실패' });

  // 실제 전투 세션 시작 — 보스를 가상 몬스터로 스폰
  try {
    const bossFull = await getBossById(boss.id);
    if (bossFull) await startGuildBossCombatSession(characterId, r.rows[0].id, bossFull);
  } catch (e) {
    console.error('[guild-boss] startGuildBossCombatSession fail', e);
  }

  res.json({ ok: true, runId: r.rows[0].id, boss, randomWeakElement: randomWeak });
});

// ============================================================
// PATCH /guild-boss/damage/:runId — 누적 데미지 업데이트 (10초 주기)
// body: { damage, hits, damageType?, element?, isDot? }
// ============================================================
interface DamagePatchBody {
  damage?: number;
  hits?: number;
  damageType?: 'physical' | 'magical';
  element?: string;
  isDot?: boolean;
}
router.patch('/damage/:runId', async (req: AuthedRequest, res: Response) => {
  const runId = req.params.runId;
  const body = req.body as DamagePatchBody;
  const rawDamage = Number(body?.damage ?? 0);
  const hits = Math.max(0, Math.floor(Number(body?.hits ?? 0)));
  const damageType = body?.damageType === 'magical' ? 'magical' : 'physical';
  const element = typeof body?.element === 'string' ? body.element : null;
  const isDot = !!body?.isDot;

  if (!Number.isFinite(rawDamage) || rawDamage < 0) {
    return res.status(400).json({ error: 'invalid damage' });
  }

  const runR = await query<{
    character_id: number; guild_id: number | null; ended_at: string | null;
    boss_id: number; total_damage: string; started_at: string;
    random_weak_element: string | null; last_recover_at: string | null;
  }>(
    `SELECT character_id, guild_id, ended_at, boss_id,
            total_damage::text, started_at::text,
            random_weak_element, last_recover_at::text
     FROM guild_boss_runs WHERE id = $1`,
    [runId]
  );
  if (!runR.rowCount) return res.status(404).json({ error: 'run not found' });
  const run = runR.rows[0];
  if (run.ended_at) return res.status(400).json({ error: '종료된 run' });

  const char = await loadCharacterOwned(run.character_id, req.userId!);
  if (!char) return res.status(403).json({ error: 'forbidden' });

  // 보스 메커닉 조회
  const bossR = await query<{
    element_immune: string | null; element_weak: string | null; weak_amp_pct: number;
    dot_immune: boolean; hp_recover_pct: number; hp_recover_interval_sec: number;
    random_weakness: boolean; alternating_immune: boolean;
  }>(
    `SELECT element_immune, element_weak, weak_amp_pct, dot_immune,
            hp_recover_pct, hp_recover_interval_sec, random_weakness, alternating_immune
     FROM guild_bosses WHERE id = $1`,
    [run.boss_id]
  );
  if (!bossR.rowCount) return res.status(500).json({ error: 'boss not found' });
  const boss = bossR.rows[0];

  // ===== 메커닉 적용 =====
  let effective = rawDamage;
  const applied: string[] = [];

  // 1) 도트 면역
  if (boss.dot_immune && isDot) {
    effective = 0;
    applied.push('도트 면역 (0)');
  }

  // 2) 원소 면역 / 약점
  if (effective > 0 && element) {
    if (boss.element_immune === element) {
      effective = 0;
      applied.push(`${element} 면역 (0)`);
    } else {
      const weakElement = boss.random_weakness ? run.random_weak_element : boss.element_weak;
      if (weakElement === element && boss.weak_amp_pct > 0) {
        effective = effective * (1 + boss.weak_amp_pct / 100);
        applied.push(`${element} 약점 +${boss.weak_amp_pct}%`);
      }
    }
  }

  // 3) 차원의 지배자 — ATK/MATK 교대 면역 (30초 주기, 약점 시간대는 예외)
  const weakpointActive = isWeakpointActive();
  if (effective > 0 && boss.alternating_immune && !weakpointActive) {
    const phase = Math.floor(Date.now() / 1000 / 30) % 2; // 0: ATK 면역, 1: MATK 면역
    if ((phase === 0 && damageType === 'physical') || (phase === 1 && damageType === 'magical')) {
      effective = 0;
      applied.push(`${damageType === 'physical' ? 'ATK' : 'MATK'} 면역 페이즈 (0)`);
    }
  }

  // 4) 누적 디버프 (길드 일일 total_hits 기준)
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

  // 6) 시계태엽 거인 — HP 회복 lazy 적용 (지난 patch 이후 경과 시간)
  let recovered = 0;
  if (boss.hp_recover_pct > 0 && boss.hp_recover_interval_sec > 0 && !weakpointActive) {
    const lastRecAt = run.last_recover_at ? new Date(run.last_recover_at).getTime() : new Date(run.started_at).getTime();
    const now = Date.now();
    const intervals = Math.floor((now - lastRecAt) / 1000 / boss.hp_recover_interval_sec);
    if (intervals > 0) {
      const curTotal = Number(run.total_damage);
      // 각 interval마다 recover_pct% 회복 (복리 아님)
      recovered = Math.floor(curTotal * (boss.hp_recover_pct / 100) * intervals);
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

  const finalEffective = Math.floor(effective);

  // 누적 데미지 반영
  if (finalEffective > 0) {
    await query(
      'UPDATE guild_boss_runs SET total_damage = total_damage + $1 WHERE id = $2',
      [finalEffective, runId]
    );
  }

  // 길드 누적 타격 수 증가 (디버프 계산용)
  if (hits > 0 && run.guild_id) {
    const today = await todayKst();
    await query(
      `INSERT INTO guild_boss_guild_daily (guild_id, date, total_hits)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, date) DO UPDATE SET total_hits = guild_boss_guild_daily.total_hits + $3`,
      [run.guild_id, today, hits]
    );
  }

  res.json({
    ok: true,
    effective: finalEffective,
    recovered,
    debuffPct,
    weakpointActive,
    applied,
  });
});

// ============================================================
// 약점 시간대 판정 (절대 시각 기준 — 매 30분마다 30초간 활성)
// ============================================================
function isWeakpointActive(): boolean {
  const nowSec = Math.floor(Date.now() / 1000);
  const intoCycle = nowSec % WEAKPOINT_PERIOD_SEC;
  return intoCycle < WEAKPOINT_WINDOW_SEC;
}

// ============================================================
// POST /guild-boss/exit/:runId — 퇴장 (상자 지급)
// ============================================================
router.post('/exit/:runId', async (req: AuthedRequest, res: Response) => {
  const runId = req.params.runId;
  const reasonRaw = (req.body as { reason?: string })?.reason;
  const reason = reasonRaw === 'death' || reasonRaw === 'logout' ? reasonRaw : 'exit';

  const runR = await query<{ character_id: number; guild_id: number | null; total_damage: string; ended_at: string | null }>(
    'SELECT character_id, guild_id, total_damage::text, ended_at FROM guild_boss_runs WHERE id = $1',
    [runId]
  );
  if (!runR.rowCount) return res.status(404).json({ error: 'run not found' });
  const run = runR.rows[0];
  if (run.ended_at) return res.status(400).json({ error: '이미 종료' });

  const char = await loadCharacterOwned(run.character_id, req.userId!);
  if (!char) return res.status(403).json({ error: 'forbidden' });

  const totalDamage = BigInt(run.total_damage);
  const totalDamageNum = Number(totalDamage);

  // 리워드 티어 판정
  let rewardTier: 'gold' | 'silver' | 'copper' | null = null;
  if (totalDamage >= BigInt(THRESHOLD_GOLD)) rewardTier = 'gold';
  else if (totalDamage >= BigInt(THRESHOLD_SILVER)) rewardTier = 'silver';
  else if (totalDamage >= BigInt(THRESHOLD_COPPER)) rewardTier = 'copper';

  // 임계값 첫 통과 비트마스크
  let thresholdsPassed = 0;
  if (totalDamage >= BigInt(THRESHOLD_COPPER)) thresholdsPassed |= 1;
  if (totalDamage >= BigInt(THRESHOLD_SILVER)) thresholdsPassed |= 2;
  if (totalDamage >= BigInt(THRESHOLD_GOLD)) thresholdsPassed |= 4;

  // run 종료
  await query(
    'UPDATE guild_boss_runs SET ended_at = NOW(), reward_tier = $1, thresholds_passed = $2, ended_reason = $3 WHERE id = $4',
    [rewardTier, thresholdsPassed, reason, runId]
  );

  // 전투 세션 종료 (버퍼 flush 후 세션 제거)
  try { await endGuildBossCombatSession(run.character_id); } catch (e) { console.error('[guild-boss] endSession fail', e); }

  // 길드 일일 누적 + 캐릭 일일 누적
  const today = await todayKst();
  await query(
    `UPDATE guild_boss_daily SET daily_damage_total = daily_damage_total + $1
     WHERE character_id = $2 AND date = $3`,
    [totalDamageNum, run.character_id, today]
  );

  let guildTiersGranted: ('copper' | 'silver' | 'gold')[] = [];
  if (run.guild_id) {
    // 길드 일일 누적은 랭킹 표시용으로만 유지
    await query(
      `INSERT INTO guild_boss_guild_daily (guild_id, date, total_damage)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, date) DO UPDATE SET total_damage = guild_boss_guild_daily.total_damage + EXCLUDED.total_damage`,
      [run.guild_id, today, totalDamageNum]
    );
    // 이 run의 데미지가 임계값을 넘으면 길드원 전원에게 해당 티어 상자 배포 (일일 1회/티어)
    const gd = await query<{ global_chest_milestones: number }>(
      'SELECT global_chest_milestones FROM guild_boss_guild_daily WHERE guild_id = $1 AND date = $2',
      [run.guild_id, today]
    );
    let milestones = gd.rows[0]?.global_chest_milestones ?? 0;
    const newlyPassed: typeof GUILD_TIER_MILESTONES = [];
    for (const m of GUILD_TIER_MILESTONES) {
      if ((milestones & m.bit) === 0 && totalDamage >= m.damage) {
        milestones |= m.bit;
        newlyPassed.push(m);
      }
    }
    if (newlyPassed.length > 0) {
      await query(
        'UPDATE guild_boss_guild_daily SET global_chest_milestones = $1 WHERE guild_id = $2 AND date = $3',
        [milestones, run.guild_id, today]
      );
      const members = await query<{ character_id: number }>(
        'SELECT character_id FROM guild_members WHERE guild_id = $1',
        [run.guild_id]
      );
      for (const m of newlyPassed) {
        guildTiersGranted.push(m.tier);
        for (const mb of members.rows) {
          // 동일 티어의 상자를 각 길드원에게 우편 지급 (각자 잭팟 독립 굴림)
          try {
            await grantChest(mb.character_id, m.tier);
            await deliverToMailbox(mb.character_id, m.subject,
              `${run.character_id === mb.character_id ? '내가' : '길드원이'} ${tierLabelKr(m.tier)} 임계값(${formatNum(m.damage)}) 달성 — 길드 전원에게 ${tierLabelKr(m.tier)} 지급`,
              0, 0, 0);
          } catch (e) { console.error('[guild-boss] guild chest fail', e); }
        }
      }
    }
  }

  // 본인 상자 지급
  let chestReward: ChestResult | null = null;
  if (rewardTier) {
    chestReward = await grantChest(run.character_id, rewardTier);
  }

  // 첫 통과 메달 보너스 (본인 기준 — 이 run에서 통과한 티어 모두)
  let firstPassBonus = 0;
  if (thresholdsPassed & 1) firstPassBonus += FIRST_PASS_MEDALS_COPPER;
  if (thresholdsPassed & 2) firstPassBonus += FIRST_PASS_MEDALS_SILVER;
  if (thresholdsPassed & 4) firstPassBonus += FIRST_PASS_MEDALS_GOLD;
  if (firstPassBonus > 0) {
    await query(
      'UPDATE characters SET guild_boss_medals = guild_boss_medals + $1 WHERE id = $2',
      [firstPassBonus, run.character_id]
    );
  }

  res.json({
    ok: true,
    totalDamage: run.total_damage,
    rewardTier,
    thresholdsPassed,
    firstPassBonus,
    chestReward,
    guildTiersGranted,
    reason,
  });
});

// ============================================================
// 상자 지급 헬퍼
// ============================================================
interface ChestResult { gold: number; medals: number; exp: number; items: { itemId: number; qty: number; name: string }[]; jackpots: string[] }

async function grantChest(characterId: number, tier: 'gold' | 'silver' | 'copper'): Promise<ChestResult> {
  const result: ChestResult = { gold: 0, medals: 0, exp: 0, items: [], jackpots: [] };

  const charR = await query<{ level: number; exp: string; class_name: string }>(
    'SELECT level, exp::text, class_name FROM characters WHERE id = $1', [characterId]
  );
  if (!charR.rowCount) return result;
  const c = charR.rows[0];

  // 확정 보상
  if (tier === 'gold') {
    result.gold = 5_000_000;
    result.medals = 50;
    result.exp = Math.floor(expForLevel(c.level) * 0.05);
    // 강화 성공 스크롤
    await addItemToInventory(characterId, ITEM_ENHANCE_SCROLL, 1).catch(() => {});
    result.items.push({ itemId: ITEM_ENHANCE_SCROLL, qty: 1, name: '강화 성공률 스크롤' });
    // 부스터 5종 패키지 — 1시간씩 (다이렉트 boost_until 연장)
    await grantBoosters(characterId, 60);
  } else if (tier === 'silver') {
    result.gold = 2_500_000;
    result.medals = 15;
    result.exp = Math.floor(expForLevel(c.level) * 0.03);
    await grantBoosters(characterId, 60); // 5종 +25% (Phase 1은 +50%과 동일 연장, 향후 효과 변형 시스템 도입)
  } else {
    result.gold = 1_000_000;
    result.medals = 5;
    result.exp = Math.floor(expForLevel(c.level) * 0.01);
    await grantBoosters(characterId, 60, true); // 1종만
  }

  // 잭팟 굴림
  if (tier === 'gold') {
    if (Math.random() < 0.01) { await addItemToInventory(characterId, ITEM_PREFIX_REROLL, 1).catch(() => {}); result.jackpots.push('접두사 수치 재굴림권'); }
    if (Math.random() < 0.01) { await addItemToInventory(characterId, ITEM_QUALITY_REROLL, 1).catch(() => {}); result.jackpots.push('품질 재굴림권'); }
    if (Math.random() < 0.01) {
      // 창고 슬롯 영구 +1 — users.storage_slots_bonus 증가
      const ur = await query<{ user_id: number }>('SELECT user_id FROM characters WHERE id = $1', [characterId]);
      if (ur.rowCount) {
        await query('UPDATE users SET storage_slots_bonus = storage_slots_bonus + 1 WHERE id = $1', [ur.rows[0].user_id]);
        result.jackpots.push('창고 슬롯 영구 +1');
      }
    }
    if (Math.random() < 0.01) {
      // 유니크 무작위 추첨권 — 즉시 유니크 1개 지급
      const uid = await pickRandomUnique(c.level);
      if (uid) {
        await addItemToInventory(characterId, uid, 1).catch(() => {});
        const ur = await query<{ name: string }>('SELECT name FROM items WHERE id = $1', [uid]);
        result.jackpots.push(`유니크 추첨: ${ur.rows[0]?.name || '알 수 없는 유니크'}`);
      }
    }
  } else if (tier === 'silver') {
    if (Math.random() < 0.01) { await addItemToInventory(characterId, ITEM_QUALITY_REROLL, 1).catch(() => {}); result.jackpots.push('품질 재굴림권'); }
    if (Math.random() < 0.05) { await addItemToInventory(characterId, ITEM_PREFIX_REROLL, 1).catch(() => {}); result.jackpots.push('접두사 수치 재굴림권'); }
  } else if (tier === 'copper') {
    if (Math.random() < 0.01) { await addItemToInventory(characterId, ITEM_PREFIX_REROLL, 1).catch(() => {}); result.jackpots.push('접두사 수치 재굴림권'); }
  }

  // 골드 / EXP / 메달 즉시 반영
  await query(
    'UPDATE characters SET gold = gold + $1, guild_boss_medals = guild_boss_medals + $2 WHERE id = $3',
    [result.gold, result.medals, characterId]
  );
  if (result.exp > 0) {
    const lv = applyExpGain(c.level, Number(c.exp), result.exp, c.class_name);
    await query(
      `UPDATE characters SET level = $1, exp = $2, max_hp = max_hp + $3, hp = max_hp + $3,
              stat_points = COALESCE(stat_points, 0) + $4, node_points = node_points + $5
       WHERE id = $6`,
      [lv.newLevel, lv.newExp, lv.hpGained, lv.statPointsGained, lv.nodePointsGained, characterId]
    );
  }

  return result;
}

async function grantBoosters(characterId: number, minutes: number, singleOnly = false) {
  // Phase 1 — 기존 exp/gold/drop boost 연장 (공격력/HP 부스터는 시스템 추가 전까지 skip)
  const interval = `INTERVAL '${minutes} minutes'`;
  if (singleOnly) {
    // 구리 상자 — 택1 (exp로 통일, 향후 선택 UI 추가)
    await query(
      `UPDATE characters SET
         exp_boost_until = GREATEST(COALESCE(exp_boost_until, NOW()), NOW()) + ${interval}
       WHERE id = $1`,
      [characterId]
    );
  } else {
    await query(
      `UPDATE characters SET
         exp_boost_until  = GREATEST(COALESCE(exp_boost_until, NOW()), NOW()) + ${interval},
         gold_boost_until = GREATEST(COALESCE(gold_boost_until, NOW()), NOW()) + ${interval},
         drop_boost_until = GREATEST(COALESCE(drop_boost_until, NOW()), NOW()) + ${interval}
       WHERE id = $1`,
      [characterId]
    );
  }
}

function tierLabelKr(tier: 'copper' | 'silver' | 'gold'): string {
  return tier === 'gold' ? '황금빛 상자' : tier === 'silver' ? '은빛 상자' : '구리 상자';
}

function formatNum(n: bigint): string {
  const num = Number(n);
  if (num >= 100_000_000) return `${(num / 100_000_000).toFixed(num % 100_000_000 === 0 ? 0 : 1)}억`;
  if (num >= 10_000) return `${(num / 10_000).toFixed(0)}만`;
  return num.toLocaleString();
}

function expForLevel(level: number): number {
  // 현 레벨의 전체 EXP — 간략 공식 (실제 공식은 leveling.ts에 의존하지만, 상자 내 EXP 두루마리용 근사)
  return Math.floor(Math.pow(level, 2.5) * 100);
}

export default router;
