// 길드 보스 시스템 Phase 1~4 — 입장 / 데미지 누적 / 퇴장 / 상자 지급
import { Router, type Response } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned, getEffectiveStats } from '../game/character.js';
import { applyExpGain } from '../game/leveling.js';
import { clampCharacterPoints } from '../game/pointClamper.js';
import { addItemToInventory, deliverToMailbox } from '../game/inventory.js';
import { startGuildBossCombatSession, endGuildBossCombatSession } from '../combat/engine.js';
import { getBossById } from '../combat/guildBossHelpers.js';

const router = Router();
router.use(authRequired);

// 아이템 ID (라이브 DB 조회 결과 기반)
const ITEM_ENHANCE_SCROLL = 286;      // 강화 성공률 스크롤
const ITEM_PREFIX_REROLL = 322;       // 접두사 수치 재굴림권
const ITEM_QUALITY_REROLL = 476;      // 품질 재굴림권 (migration 031)
const ITEM_UNIQUE_TICKET = 477;       // 유니크 무작위 추첨권 (migration 033)
const ITEM_CHEST_GOLD = 843;          // 길드 보스 황금빛 상자 (migration 041)
const ITEM_CHEST_SILVER = 844;        // 길드 보스 은빛 상자
const ITEM_CHEST_COPPER = 845;        // 길드 보스 구리 상자

function chestItemId(tier: 'gold' | 'silver' | 'copper'): number {
  return tier === 'gold' ? ITEM_CHEST_GOLD : tier === 'silver' ? ITEM_CHEST_SILVER : ITEM_CHEST_COPPER;
}

// 캐릭 레벨 기준 유니크 풀에서 무작위 1개 선택.
// 제외: bound_on_pickup=true (시공 분쇄 110제 + 재료/통행증), slot IS NULL (재료/소비).
// 즉 거래 가능한 일반 유니크 장비만 추첨 풀에 포함.
export async function pickRandomUnique(characterLevel: number): Promise<number | null> {
  const low = Math.max(1, characterLevel - 10);
  const high = characterLevel + 10;
  const r = await query<{ id: number }>(
    `SELECT id FROM items
     WHERE grade = 'unique'
       AND required_level BETWEEN $1 AND $2
       AND slot IS NOT NULL
       AND bound_on_pickup = FALSE
     ORDER BY RANDOM() LIMIT 1`,
    [low, high]
  );
  return r.rows[0]?.id ?? null;
}

// 데미지 임계값 (단위: 실제 입힌 데미지)
const THRESHOLD_COPPER = 100_000_000;      // 1억
const THRESHOLD_SILVER = 500_000_000;      // 5억
const THRESHOLD_GOLD = 1_000_000_000;      // 10억 — 황금상자 임계값 (원복)
const THRESHOLD_KILL = 5_000_000_000n;     // 50억 — 보스 HP 처치 조건
const KILL_BIT = 8;                        // global_chest_milestones bit 8 = 처치 완료 플래그

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

  // 일반 유저도 길드보스 접근 허용 — 길드 미가입자는 개인 run 진행만 가능
  // (길드 누적·티어 상자·처치 보상은 길드 소속 시에만 반영)
  const guildId = await getCharacterGuildId(characterId);

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

  // 오프라인 모드 캐릭은 보상 정산 전 신규 컨텐츠 진입 차단.
  // (last_offline_at 잔존 시 길드보스 진입 → 사망 시 offline 보상까지 일괄 증발하던 문제 차단.)
  const offR = await query<{ last_offline_at: string | null }>(
    'SELECT last_offline_at FROM characters WHERE id = $1', [characterId]
  );
  if (offR.rows[0]?.last_offline_at) {
    return res.status(400).json({ error: '오프라인 보상 정산 후 길드 보스에 입장할 수 있습니다.' });
  }

  // 일반 유저도 길드보스 접근 허용 — 길드 미가입자는 개인 run 진행만 가능
  // (길드 누적·티어 상자·처치 보상은 길드 소속 시에만 반영)
  const guildId = await getCharacterGuildId(characterId);

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

  // 입장 시 HP 풀피 회복 (장비·패시브 포함 실효 max_hp) — 성직자(cleric)는 자체 힐 설계상 제외
  if (char.class_name !== 'cleric') {
    try {
      const eff = await getEffectiveStats(char);
      await query('UPDATE characters SET hp = $1 WHERE id = $2', [eff.maxHp, characterId]);
    } catch (e) {
      console.error('[guild-boss] hp refill fail', e);
    }
  }

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
// POST /guild-boss/practice/:characterId — 연습 모드 입장
// - 입장 키 소모 X
// - guild_boss_runs 에 row 생성하지 않음 (DB 기록·딜 집계·보상 전부 없음)
// - 단순히 오늘의 보스와 동일 조건으로 전투해보고 퇴장 가능
// ============================================================
router.post('/practice/:characterId', async (req: AuthedRequest, res: Response) => {
  const characterId = Number(req.params.characterId);
  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'character not found' });

  // 오프라인 모드 캐릭은 정식 입장과 동일 정책 — 보상 정산 후 진입.
  const offR = await query<{ last_offline_at: string | null }>(
    'SELECT last_offline_at FROM characters WHERE id = $1', [characterId]
  );
  if (offR.rows[0]?.last_offline_at) {
    return res.status(400).json({ error: '오프라인 보상 정산 후 길드 보스에 입장할 수 있습니다.' });
  }

  // 일반 유저도 길드보스 접근 허용 — 길드 미가입자는 개인 run 진행만 가능
  // (길드 누적·티어 상자·처치 보상은 길드 소속 시에만 반영)
  const guildId = await getCharacterGuildId(characterId);

  const boss = await getTodaysBoss();
  if (!boss) return res.status(500).json({ error: '오늘의 보스 설정 없음' });

  // 정식 run 이 이미 진행 중이면 연습 진입 차단 (동시 세션 충돌 방지)
  const ongoing = await query(
    `SELECT id FROM guild_boss_runs WHERE character_id = $1 AND ended_at IS NULL`,
    [characterId]
  );
  if (ongoing.rowCount && ongoing.rowCount > 0) {
    return res.status(400).json({ error: '이미 진행 중인 입장 있음' });
  }

  // HP 풀피 회복 (장비·패시브 포함 실효 max_hp, 성직자 제외) — 입장 로직과 동일
  if (char.class_name !== 'cleric') {
    try {
      const eff = await getEffectiveStats(char);
      await query('UPDATE characters SET hp = $1 WHERE id = $2', [eff.maxHp, characterId]);
    } catch (e) {
      console.error('[guild-boss-practice] hp refill fail', e);
    }
  }

  // 실제 전투 세션 시작 — runId 는 메모리 한정 임시 UUID (DB 없음)
  // 랜덤 약점은 연습 모드에서 생략 (DB run row 가 없어 저장 불가 — 테스트용이라 고정 약점 기반)
  const practiceRunId = `practice-${characterId}-${Date.now()}`;
  try {
    const bossFull = await getBossById(boss.id);
    if (bossFull) await startGuildBossCombatSession(characterId, practiceRunId, bossFull, true);
  } catch (e) {
    console.error('[guild-boss-practice] session start fail', e);
  }

  res.json({ ok: true, practice: true, runId: practiceRunId, boss });
});

// POST /guild-boss/practice-exit/:characterId — 연습 모드 퇴장
router.post('/practice-exit/:characterId', async (req: AuthedRequest, res: Response) => {
  const characterId = Number(req.params.characterId);
  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'character not found' });
  try { await endGuildBossCombatSession(characterId); } catch (e) { console.error('[guild-boss-practice] end fail', e); }
  res.json({ ok: true });
});

// ============================================================
// POST /guild-boss/open-chest/:characterId — 상자 아이템 개봉
// body: { tier: 'gold'|'silver'|'copper' }
// ============================================================
router.post('/open-chest/:characterId', async (req: AuthedRequest, res: Response) => {
  const characterId = Number(req.params.characterId);
  const char = await loadCharacterOwned(characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'character not found' });

  const tier = (req.body as { tier?: string })?.tier;
  if (tier !== 'gold' && tier !== 'silver' && tier !== 'copper') {
    return res.status(400).json({ error: 'tier 는 gold|silver|copper 중 하나여야 합니다.' });
  }

  // 인벤에서 해당 상자 아이템 조회 — quantity > 0 우선, 없으면 ghost(quantity<=0) row 도 검사
  const itemId = chestItemId(tier);
  const stackR = await query<{ id: number; quantity: number }>(
    `SELECT id, quantity FROM character_inventory
     WHERE character_id = $1 AND item_id = $2
     ORDER BY (quantity > 0) DESC, slot_index LIMIT 1`,
    [characterId, itemId]
  );
  if (stackR.rowCount === 0) {
    return res.status(400).json({ error: '해당 상자를 보유하고 있지 않습니다.' });
  }
  const stack = stackR.rows[0];
  // quantity 0 ghost row — 자동 cleanup 후 다시 안내 (사용자 재시도하면 깔끔히 사라짐)
  if (Number(stack.quantity) <= 0) {
    await query('DELETE FROM character_inventory WHERE id = $1', [stack.id]);
    return res.status(400).json({ error: '비어있는 상자 슬롯을 정리했습니다. 새로고침 후 다시 확인해주세요.' });
  }

  // 보상 지급 먼저 (실패 시 상자 소모 X — use-unique-ticket 패턴과 동일)
  const chestReward = await grantChest(characterId, tier);

  // 상자 1개 소모
  if (Number(stack.quantity) <= 1) {
    await query('DELETE FROM character_inventory WHERE id = $1', [stack.id]);
  } else {
    await query('UPDATE character_inventory SET quantity = quantity - 1 WHERE id = $1', [stack.id]);
  }

  res.json({ ok: true, tier, chestReward });
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

  // 3) 차원의 지배자 — ATK/MATK 교대 면역 (30초 주기, 상시)
  if (effective > 0 && boss.alternating_immune) {
    const phase = Math.floor(Date.now() / 1000 / 30) % 2; // 0: ATK 면역, 1: MATK 면역
    if ((phase === 0 && damageType === 'physical') || (phase === 1 && damageType === 'magical')) {
      effective = 0;
      applied.push(`${damageType === 'physical' ? 'ATK' : 'MATK'} 면역 페이즈 (0)`);
    }
  }

  // 4) 시계태엽 거인 — HP 회복 lazy 적용 (상시)
  let recovered = 0;
  if (boss.hp_recover_pct > 0 && boss.hp_recover_interval_sec > 0) {
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

  // 길드 누적 타격 수 — total_hits 컬럼은 유지 (통계/랭킹용)
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
    applied,
  });
});

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

  // run 종료 — 원자적 가드: ended_at IS NULL 조건으로 중복 호출 차단.
  // 동시 호출/재시도/death 핸들러 선행 시 rowCount=0 → 상자 발송 없이 종료 응답.
  const endR = await query(
    `UPDATE guild_boss_runs SET ended_at = NOW(), reward_tier = $1, thresholds_passed = $2, ended_reason = $3
      WHERE id = $4 AND ended_at IS NULL`,
    [rewardTier, thresholdsPassed, reason, runId]
  );
  if (endR.rowCount === 0) {
    return res.status(400).json({ error: '이미 종료된 입장입니다.' });
  }

  // 전투 세션 종료 (버퍼 flush 후 세션 제거)
  try { await endGuildBossCombatSession(run.character_id); } catch (e) { console.error('[guild-boss] endSession fail', e); }

  // 캐릭 / 길드 일일 누적은 applyDamageToRun 에서 실시간 반영됨 — 여기서 중복 가산 제거.
  const today = await todayKst();

  let guildTiersGranted: ('copper' | 'silver' | 'gold')[] = [];
  if (run.guild_id) {
    const judged = await judgeAndGrantGuildMilestones(run.guild_id, today, run.character_id);
    guildTiersGranted = judged.newlyPassed.filter(t => t !== 'kill') as ('copper'|'silver'|'gold')[];
  }

  // 본인 상자 수령 — 아이템 형태로 우편 발송 (인벤에서 개봉)
  let chestDelivered = false;
  let passDelivered = false;
  if (rewardTier) {
    await deliverChestItem(run.character_id, rewardTier, 'exit');
    chestDelivered = true;
  }
  // 차원의 통행증 보상 폐기 (2026-04-30) — 통행증 시스템 제거

  res.json({
    ok: true,
    totalDamage: run.total_damage,
    rewardTier,
    thresholdsPassed,
    chestDelivered,
    passDelivered,
    guildTiersGranted,
    reason,
  });
});

// 상자 아이템을 우편함으로 전달 (수령 후 인벤에서 개봉)
async function deliverChestItem(
  characterId: number,
  tier: 'gold' | 'silver' | 'copper',
  reason: 'exit' | 'guild-milestone' | 'admin',
) {
  const label = tierLabelKr(tier);
  const subject =
    reason === 'exit' ? `길드 보스 — ${label} 수령`
    : reason === 'guild-milestone' ? `길드 보스 — ${label} (길드원 보상)`
    : `운영자 — ${label} 지급`;
  const body =
    reason === 'exit' ? `입장 퇴장 보상으로 ${label}를 수령했습니다. 우편 수령 후 인벤에서 개봉하세요.`
    : reason === 'guild-milestone' ? `길드 누적 데미지 임계값 달성으로 ${label}를 수령했습니다. 우편 수령 후 인벤에서 개봉하세요.`
    : `운영자가 ${label}를 지급했습니다. 우편 수령 후 인벤에서 개봉하세요.`;
  await deliverToMailbox(characterId, subject, body, chestItemId(tier), 1, 0);
}

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
    if (Math.random() < 0.05) { await addItemToInventory(characterId, ITEM_PREFIX_REROLL, 1).catch(() => {}); result.jackpots.push('접두사 수치 재굴림권'); }
    if (Math.random() < 0.02) { await addItemToInventory(characterId, ITEM_QUALITY_REROLL, 1).catch(() => {}); result.jackpots.push('품질 재굴림권'); }
    if (Math.random() < 0.01) {
      // 창고 슬롯 영구 +1 — users.storage_slots_bonus 증가
      const ur = await query<{ user_id: number }>('SELECT user_id FROM characters WHERE id = $1', [characterId]);
      if (ur.rowCount) {
        await query('UPDATE users SET storage_slots_bonus = storage_slots_bonus + 1 WHERE id = $1', [ur.rows[0].user_id]);
        result.jackpots.push('창고 슬롯 영구 +1');
      }
    }
    if (Math.random() < 0.01) {
      // 유니크 무작위 추첨권 — 추첨권 아이템 인벤 지급 (유저가 사용 시 유니크 추첨)
      await addItemToInventory(characterId, ITEM_UNIQUE_TICKET, 1).catch(() => {});
      result.jackpots.push('유니크 무작위 추첨권');
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
    clampCharacterPoints(characterId).catch(() => {});
  }

  return result;
}

async function grantBoosters(characterId: number, minutes: number, singleOnly = false) {
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
    // 3종 패키지 — EXP / 골드 / 드랍 각 1시간 연장 (공격력·HP 버프 삭제)
    await query(
      `UPDATE characters SET
         exp_boost_until  = GREATEST(COALESCE(exp_boost_until, NOW()), NOW()) + ${interval},
         gold_boost_until = GREATEST(COALESCE(gold_boost_until, NOW()), NOW()) + ${interval},
         drop_boost_until = GREATEST(COALESCE(drop_boost_until, NOW()), NOW()) + ${interval}
       WHERE id = $1`,
      [characterId]
    );
  }
  // 세션 캐시 무효화 — 진행 중 전투 세션이 있다면 다음 push 시 새 boost 시각 반영
  try {
    const { invalidateSessionMeta } = await import('../combat/engine.js');
    invalidateSessionMeta(characterId);
  } catch {}
}

function tierLabelKr(tier: 'copper' | 'silver' | 'gold'): string {
  return tier === 'gold' ? '황금빛 상자' : tier === 'silver' ? '은빛 상자' : '구리 상자';
}

// ============================================================
// 길드 누적 damage 기반 milestone 판정 + 상자/메달 즉시 지급.
// exit 뿐 아니라 실시간 flush loop 에서도 호출되어 유저가 퇴장하지 않아도
// 임계값 도달 즉시 길드원 전원 보상 수령.
// ============================================================
export async function judgeAndGrantGuildMilestones(
  guildId: number,
  today: string,
  triggerCharId: number | null = null
): Promise<{ newlyPassed: string[]; killGranted: boolean }> {
  const gd = await query<{ global_chest_milestones: number; total_damage: string }>(
    'SELECT global_chest_milestones, total_damage::text FROM guild_boss_guild_daily WHERE guild_id = $1 AND date = $2',
    [guildId, today]
  );
  if (!gd.rowCount) return { newlyPassed: [], killGranted: false };
  let milestones = gd.rows[0].global_chest_milestones;
  const guildDamage = BigInt(gd.rows[0].total_damage);

  const newlyPassed: typeof GUILD_TIER_MILESTONES = [];
  for (const m of GUILD_TIER_MILESTONES) {
    if (guildDamage >= m.damage && (milestones & m.bit) === 0) {
      milestones |= m.bit;
      newlyPassed.push(m);
    }
  }
  const killNowPassed = guildDamage >= THRESHOLD_KILL && (milestones & KILL_BIT) === 0;
  if (killNowPassed) milestones |= KILL_BIT;
  if (newlyPassed.length === 0 && !killNowPassed) return { newlyPassed: [], killGranted: false };

  await query(
    'UPDATE guild_boss_guild_daily SET global_chest_milestones = $1 WHERE guild_id = $2 AND date = $3',
    [milestones, guildId, today]
  );
  const members = await query<{ character_id: number }>(
    'SELECT character_id FROM guild_members WHERE guild_id = $1', [guildId]
  );

  for (const m of newlyPassed) {
    for (const mb of members.rows) {
      try {
        // 상자 아이템 자체를 우편 첨부로 발송 (개봉은 유저가 인벤에서 수행)
        const body = `${triggerCharId === mb.character_id ? '내가' : '길드원이'} ${tierLabelKr(m.tier)} 임계값(${formatNum(m.damage)}) 달성 — 길드 전원에게 ${tierLabelKr(m.tier)} 지급. 우편 수령 후 인벤에서 개봉하세요.`;
        await deliverToMailbox(mb.character_id, m.subject, body, chestItemId(m.tier), 1, 0);
      } catch (e) { console.error('[guild-boss] chest fail', guildId, mb.character_id, e); }
    }
  }
  if (killNowPassed) {
    try {
      const ids = members.rows.map(mb => mb.character_id);
      await query(
        'UPDATE characters SET guild_boss_medals = guild_boss_medals + 1000 WHERE id = ANY($1::int[])',
        [ids]
      );
      // 길드 풀에 길드 전용 메달 +1000 (50억 처치 보상, 개인 메달과 별개)
      await query(
        'UPDATE guilds SET guild_medals = guild_medals + 1000 WHERE id = $1',
        [guildId]
      );
      for (const mb of members.rows) {
        await deliverToMailbox(mb.character_id,
          '길드 보스 처치! 메달 1000 지급',
          '오늘의 길드 보스를 처치한 공적으로 전 길드원에게 개인 메달 1000개가 지급되었습니다.\n또한 길드 풀에 길드 전용 메달 1,000개가 적립되었습니다 (길드장/부길드장이 길드 상점에서 사용).',
          0, 0, 0);
      }
    } catch (e) { console.error('[guild-boss] kill reward fail', guildId, e); }
  }
  return { newlyPassed: newlyPassed.map(m => m.tier), killGranted: killNowPassed };
}

// ============================================================
// 관리자 전용: 이미 임계값 통과했지만 milestone 비트가 세팅 안 된 길드들에
// 상자/메달 소급 지급. (exit 핸들러 milestone 기준 버그 이전에 쌓인 누적분 복구용)
// ============================================================
// 관리자: 특정 길드에 특정 티어 상자 수동 지급 (운영 보상용)
// 예: POST /guild-boss/admin/grant-guild-chest?guildId=12&tier=gold
router.post('/admin/grant-guild-chest', async (req: AuthedRequest, res: Response) => {
  const uR = await query<{ is_admin: boolean }>('SELECT is_admin FROM users WHERE id = $1', [req.userId!]);
  if (!uR.rowCount || !uR.rows[0].is_admin) return res.status(403).json({ error: 'admin only' });

  const guildId = Number(req.query.guildId);
  const tier = String(req.query.tier || '') as 'gold' | 'silver' | 'copper';
  if (!guildId || !['gold','silver','copper'].includes(tier)) {
    return res.status(400).json({ error: 'guildId, tier (gold|silver|copper) 필수' });
  }

  const members = await query<{ character_id: number }>(
    'SELECT character_id FROM guild_members WHERE guild_id = $1', [guildId]
  );
  let granted = 0;
  for (const m of members.rows) {
    try {
      await deliverChestItem(m.character_id, tier, 'admin');
      granted++;
    } catch (e) { console.error('[gb-manual-grant] fail', m.character_id, e); }
  }
  res.json({ ok: true, guildId, tier, granted, members: members.rowCount });
});

router.post('/admin/backfill', async (req: AuthedRequest, res: Response) => {
  // 관리자 체크
  const uR = await query<{ is_admin: boolean }>(
    'SELECT is_admin FROM users WHERE id = $1', [req.userId!]
  );
  if (!uR.rowCount || !uR.rows[0].is_admin) return res.status(403).json({ error: 'admin only' });

  // 쿼리 파라미터 date 지정 가능. 형식 YYYY-MM-DD. 기본값 = 오늘 (KST).
  const dateParam = (req.query.date as string | undefined);
  const today = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : await todayKst();
  const rows = await query<{ guild_id: number; total_damage: string; global_chest_milestones: number }>(
    `SELECT guild_id, total_damage::text, global_chest_milestones
       FROM guild_boss_guild_daily WHERE date = $1`,
    [today]
  );

  const results: { guildId: number; granted: string[] }[] = [];
  for (const g of rows.rows) {
    const guildDamage = BigInt(g.total_damage);
    let milestones = g.global_chest_milestones;
    const granted: string[] = [];

    const members = await query<{ character_id: number }>(
      'SELECT character_id FROM guild_members WHERE guild_id = $1', [g.guild_id]
    );
    if (members.rowCount === 0) continue;

    // 티어 상자 (copper/silver/gold) — 상자 아이템을 우편 첨부로 발송
    for (const m of GUILD_TIER_MILESTONES) {
      if (guildDamage >= m.damage && (milestones & m.bit) === 0) {
        milestones |= m.bit;
        for (const mb of members.rows) {
          try {
            const body = `[소급] ${tierLabelKr(m.tier)} 임계값(${formatNum(m.damage)}) 길드 달성 — 전원 지급. 우편 수령 후 인벤에서 개봉하세요.`;
            await deliverToMailbox(mb.character_id, m.subject, body, chestItemId(m.tier), 1, 0);
          } catch (e) { console.error('[gb-backfill] chest fail', g.guild_id, mb.character_id, e); }
        }
        granted.push(m.tier);
      }
    }

    // 처치 메달
    if (guildDamage >= THRESHOLD_KILL && (milestones & KILL_BIT) === 0) {
      milestones |= KILL_BIT;
      try {
        const ids = members.rows.map(mb => mb.character_id);
        await query(
          'UPDATE characters SET guild_boss_medals = guild_boss_medals + 1000 WHERE id = ANY($1::int[])',
          [ids]
        );
        for (const mb of members.rows) {
          await deliverToMailbox(mb.character_id,
            '[소급] 길드 보스 처치 — 메달 1000 지급',
            '오늘의 길드 보스 처치 공적으로 메달 1000개가 지급되었습니다.',
            0, 0, 0);
        }
        granted.push('kill');
      } catch (e) { console.error('[gb-backfill] kill fail', g.guild_id, e); }
    }

    if (milestones !== g.global_chest_milestones) {
      await query(
        'UPDATE guild_boss_guild_daily SET global_chest_milestones = $1 WHERE guild_id = $2 AND date = $3',
        [milestones, g.guild_id, today]
      );
    }
    if (granted.length > 0) results.push({ guildId: g.guild_id, granted });
  }

  res.json({ ok: true, guildsProcessed: results.length, details: results });
});

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
