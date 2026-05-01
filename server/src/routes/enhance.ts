import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { rerollPrefixValues, displayPrefixStats, generateSinglePrefixOfTier, generateGuaranteed3Prefixes } from '../game/prefix.js';
import { resolvePrefixes } from '../game/prefix.js';
import { refreshSessionStats } from '../combat/engine.js';

const router = Router();
router.use(authRequired);

// 강화 비용/확률/파괴율
// 강화 시스템 v2 (2026-05-01):
// - 최대 30강
// - 파괴 폐지 (전 단계 destroyRate=0)
// - +1~+10 +5%/단계 / +11~+20 +10%/단계 / +21~+30 +15%/단계 (스탯 누적 배율)
// - +15 부터 절대값 비용 (× Lv 없음). +15 250만, +16 500만 ... +20 1500만
// - +21~+30 절대값 시작 5천만, +1천만/단계 (+30 = 1.4억)
// - +21~+30 항상 base 1% + pity × 0.1% (실패 시 +1, 성공 시 0 리셋)
// - +21+ 강화 스크롤 사용 불가
export function getEnhanceInfo(currentLevel: number, itemLevel: number, pity: number = 0) {
  const next = currentLevel + 1;
  const lv = Math.max(1, itemLevel);
  let cost: number;
  let chance: number;
  let scrollAllowed = true;
  if (next <= 3)        { cost = 50 * lv;     chance = 1.0; }
  else if (next <= 6)   { cost = 200 * lv;    chance = 0.8; }
  else if (next <= 9)   { cost = 500 * lv;    chance = 0.5; }
  else if (next <= 12)  { cost = 2000 * lv;   chance = 0.3; }
  else if (next <= 14)  { cost = 5000 * lv;   chance = 0.2; }
  else if (next === 15) { cost = 2_500_000;   chance = 0.2; }
  else if (next <= 18)  { cost = 2_500_000 * (next - 14); chance = 0.1; }
  else if (next <= 20)  { cost = 2_500_000 * (next - 14); chance = 0.05; }
  else if (next <= 30)  {
    cost = 50_000_000 + (next - 21) * 10_000_000;
    chance = Math.min(1.0, 0.01 + Math.max(0, pity) * 0.001);
    scrollAllowed = false;
  }
  else { cost = 0; chance = 0; }
  return { cost, chance, destroyRate: 0, nextLevel: next, scrollAllowed };
}

// 강화 단계별 누적 스탯 배율 — +5/10/15% 구간식
export function calcEnhanceMult(level: number): number {
  const a = Math.min(10, level)                    * 0.05;
  const b = Math.max(0, Math.min(10, level - 10))  * 0.10;
  const c = Math.max(0, Math.min(10, level - 20))  * 0.15;
  return 1 + a + b + c;
}

// 현재 인벤 / 장착 중 강화 가능한 아이템 목록
router.get('/:characterId/list', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 인벤토리
  const inv = await query<{ slot_index: number; item_id: number; enhance_level: number; name: string; grade: string; slot: string | null; stats: Record<string, number> | null; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; quality: number; required_level: number }>(
    `SELECT ci.slot_index, ci.item_id, ci.enhance_level, i.name, i.grade, i.slot, i.stats, ci.prefix_ids, ci.prefix_stats, COALESCE(ci.quality, 0) AS quality, COALESCE(i.required_level, 1) AS required_level
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND i.slot IS NOT NULL AND ci.quantity = 1
     ORDER BY ci.slot_index`,
    [cid]
  );
  // 장착
  const eq = await query<{ slot: string; item_id: number; enhance_level: number; name: string; grade: string; item_slot: string; stats: Record<string, number> | null; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; quality: number; required_level: number }>(
    `SELECT ce.slot, ce.item_id, ce.enhance_level, i.name, i.grade, i.slot AS item_slot, i.stats, ce.prefix_ids, ce.prefix_stats, COALESCE(ce.quality, 0) AS quality, COALESCE(i.required_level, 1) AS required_level
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id
     WHERE ce.character_id = $1`,
    [cid]
  );

  // 접두사 이름 조회 (한꺼번에)
  const allPrefixIds = [...new Set([...inv.rows, ...eq.rows].flatMap(r => r.prefix_ids || []))];
  const prefixNameMap = new Map<number, string>();
  if (allPrefixIds.length > 0) {
    const pr = await query<{ id: number; name: string }>(
      'SELECT id, name FROM item_prefixes WHERE id = ANY($1::int[])', [allPrefixIds]
    );
    for (const p of pr.rows) prefixNameMap.set(p.id, p.name);
  }
  function buildPrefixName(ids: number[] | null): string {
    if (!ids || ids.length === 0) return '';
    return ids.map(id => prefixNameMap.get(id)).filter(Boolean).join(' ');
  }

  function enhancedStats(baseStats: Record<string, number> | null, enhLevel: number): Record<string, number> | null {
    if (!baseStats) return null;
    const mult = calcEnhanceMult(enhLevel || 0);
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(baseStats)) {
      result[k] = Math.round((v as number) * mult);
    }
    return result;
  }

  // 강화 스크롤 보유량 조회
  const scrollR = await query<{ quantity: number }>(
    `SELECT COALESCE(SUM(ci.quantity), 0)::int AS quantity
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND i.name = '강화 성공률 스크롤'`,
    [cid]
  );
  const scrollCount = scrollR.rows[0]?.quantity || 0;

  // 접두사 수치 재굴림권 보유량 조회
  const rerollR = await query<{ quantity: number }>(
    `SELECT COALESCE(SUM(ci.quantity), 0)::int AS quantity
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND i.name = '접두사 수치 재굴림권'`,
    [cid]
  );
  const rerollCount = rerollR.rows[0]?.quantity || 0;

  // 품질 재굴림권 보유량 조회
  const qualityRerollR = await query<{ quantity: number }>(
    `SELECT COALESCE(SUM(ci.quantity), 0)::int AS quantity
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND i.name = '품질 재굴림권'`,
    [cid]
  );
  const qualityRerollCount = qualityRerollR.rows[0]?.quantity || 0;

  // T1/T2/T3 접두사 보장 추첨권 + 3옵 보장 굴림권 보유량
  const tktR = await query<{ t1_count: number; t2_count: number; t3_count: number; p3_count: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN i.name = 'T1 접두사 보장 추첨권' THEN ci.quantity ELSE 0 END), 0)::int AS t1_count,
       COALESCE(SUM(CASE WHEN i.name = 'T2 접두사 보장 추첨권' THEN ci.quantity ELSE 0 END), 0)::int AS t2_count,
       COALESCE(SUM(CASE WHEN i.name = 'T3 접두사 보장 추첨권' THEN ci.quantity ELSE 0 END), 0)::int AS t3_count,
       COALESCE(SUM(CASE WHEN i.name = '3옵 보장 굴림권' THEN ci.quantity ELSE 0 END), 0)::int AS p3_count
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND i.name IN ('T1 접두사 보장 추첨권', 'T2 접두사 보장 추첨권', 'T3 접두사 보장 추첨권', '3옵 보장 굴림권')`,
    [cid]
  );
  const t1TicketCount = tktR.rows[0]?.t1_count || 0;
  const t2TicketCount = tktR.rows[0]?.t2_count || 0;
  const t3TicketCount = tktR.rows[0]?.t3_count || 0;
  const p3TicketCount = tktR.rows[0]?.p3_count || 0;

  // stat_key → 최대 tier 매핑 (T4 강조용) + min/max 재굴림 범위 표시용
  const prefixTierMap = new Map<number, { statKey: string; tier: number; minVal: number; maxVal: number }>();
  if (allPrefixIds.length > 0) {
    const tr = await query<{ id: number; stat_key: string; tier: number; min_val: number; max_val: number }>(
      'SELECT id, stat_key, tier, min_val, max_val FROM item_prefixes WHERE id = ANY($1::int[])', [allPrefixIds]
    );
    for (const row of tr.rows) prefixTierMap.set(row.id, { statKey: row.stat_key, tier: row.tier, minVal: row.min_val, maxVal: row.max_val });
  }

  // 재굴림 범위 계산: rerollPrefixValues 와 동일한 공식 사용 (prefix.ts 참고)
  //   levelScale = 0.4 + (min(70, max(1, itemLv))/70) * 1.4
  //   value = max(1, round(baseValue * levelScale))
  function calcLevelScale(itemLevel: number): number {
    return 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
  }
  function buildRerollRanges(ids: number[] | null, itemLevel: number): { scaledMin: number; scaledMax: number }[] {
    const scale = calcLevelScale(itemLevel);
    if (!ids) return [];
    return ids.map(id => {
      const info = prefixTierMap.get(id);
      if (!info) return { scaledMin: 0, scaledMax: 0 };
      return {
        scaledMin: Math.max(1, Math.round(info.minVal * scale)),
        scaledMax: Math.max(1, Math.round(info.maxVal * scale)),
      };
    });
  }
  function buildPrefixTiers(ids: number[] | null): Record<string, number> {
    const result: Record<string, number> = {};
    if (!ids) return result;
    for (const id of ids) {
      const info = prefixTierMap.get(id);
      if (!info) continue;
      if (!result[info.statKey] || result[info.statKey] < info.tier) {
        result[info.statKey] = info.tier;
      }
    }
    return result;
  }
  // 인덱스 순서를 보존한 per-접두사 정보 (재굴림 선택 UI용)
  function buildPrefixDetails(
    ids: number[] | null,
    itemLevel: number,
  ): { id: number; statKey: string; tier: number; scaledMin: number; scaledMax: number }[] {
    if (!ids) return [];
    const ranges = buildRerollRanges(ids, itemLevel);
    return ids.map((id, i) => {
      const info = prefixTierMap.get(id);
      const r = ranges[i] || { scaledMin: 0, scaledMax: 0 };
      return info
        ? { id, statKey: info.statKey, tier: info.tier, scaledMin: r.scaledMin, scaledMax: r.scaledMax }
        : { id, statKey: 'unknown', tier: 1, scaledMin: 0, scaledMax: 0 };
    });
  }

  res.json({
    inventory: inv.rows.map(r => ({
      kind: 'inventory' as const, slotIndex: r.slot_index,
      itemId: r.item_id, name: r.name, grade: r.grade, itemSlot: r.slot,
      stats: enhancedStats(r.stats, r.enhance_level),
      baseStats: r.stats,
      enhanceLevel: r.enhance_level,
      prefixIds: r.prefix_ids || [],
      prefixStats: displayPrefixStats(r.prefix_stats, r.enhance_level),
      prefixStatsRaw: displayPrefixStats(r.prefix_stats, 0),
      prefixName: buildPrefixName(r.prefix_ids),
      prefixTiers: buildPrefixTiers(r.prefix_ids),
      prefixDetails: buildPrefixDetails(r.prefix_ids, r.required_level),
      quality: r.quality || 0,
    })),
    equipped: eq.rows.map(r => ({
      kind: 'equipped' as const, equipSlot: r.slot,
      itemId: r.item_id, name: r.name, grade: r.grade, itemSlot: r.item_slot,
      stats: enhancedStats(r.stats, r.enhance_level),
      baseStats: r.stats,
      enhanceLevel: r.enhance_level,
      prefixIds: r.prefix_ids || [],
      prefixStats: displayPrefixStats(r.prefix_stats, r.enhance_level),
      prefixStatsRaw: displayPrefixStats(r.prefix_stats, 0),
      prefixName: buildPrefixName(r.prefix_ids),
      prefixTiers: buildPrefixTiers(r.prefix_ids),
      prefixDetails: buildPrefixDetails(r.prefix_ids, r.required_level),
      quality: r.quality || 0,
    })),
    scrollCount,
    rerollCount,
    qualityRerollCount,
    t1TicketCount,
    t2TicketCount,
    t3TicketCount,
    p3TicketCount,
  });
});

// 강화 시도
router.post('/:characterId/attempt', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({
    kind: z.enum(['inventory', 'equipped']),
    slotKey: z.union([z.number().int().min(0), z.string()]),
    useScroll: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  // 대상 아이템 조회 (pity 같이)
  let currentLevel: number;
  let currentPity: number;
  let itemName = '';
  let itemGrade = '';
  if (parsed.data.kind === 'inventory') {
    const r = await query<{ enhance_level: number; enhance_pity: number; name: string; grade: string }>(
      `SELECT ci.enhance_level, COALESCE(ci.enhance_pity, 0) AS enhance_pity, i.name, i.grade
         FROM character_inventory ci JOIN items i ON i.id = ci.item_id
        WHERE ci.character_id = $1 AND ci.slot_index = $2 AND ci.quantity = 1`,
      [cid, parsed.data.slotKey]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'item not found' });
    currentLevel = r.rows[0].enhance_level;
    currentPity = Number(r.rows[0].enhance_pity || 0);
    itemName = r.rows[0].name;
    itemGrade = r.rows[0].grade;
  } else {
    const r = await query<{ enhance_level: number; enhance_pity: number; name: string; grade: string }>(
      `SELECT ce.enhance_level, COALESCE(ce.enhance_pity, 0) AS enhance_pity, i.name, i.grade
         FROM character_equipped ce JOIN items i ON i.id = ce.item_id
        WHERE ce.character_id = $1 AND ce.slot = $2`,
      [cid, parsed.data.slotKey]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'item not found' });
    currentLevel = r.rows[0].enhance_level;
    currentPity = Number(r.rows[0].enhance_pity || 0);
    itemName = r.rows[0].name;
    itemGrade = r.rows[0].grade;
  }

  if (currentLevel >= 30) return res.status(400).json({ error: '최대 강화 단계' });

  const info = getEnhanceInfo(currentLevel, char.level, currentPity);
  if (char.gold < info.cost) return res.status(400).json({ error: 'not enough gold' });

  // 스크롤 사용 — +21+ 단계는 차단
  let bonusChance = 0;
  if (parsed.data.useScroll) {
    if (!info.scrollAllowed) {
      return res.status(400).json({ error: '+21 이상은 강화 성공률 스크롤 사용 불가' });
    }
    const scrollR = await query<{ id: number; quantity: number }>(
      `SELECT ci.id, ci.quantity FROM character_inventory ci JOIN items i ON i.id = ci.item_id
       WHERE ci.character_id = $1 AND i.name = '강화 성공률 스크롤' AND ci.quantity > 0
       ORDER BY ci.slot_index LIMIT 1`,
      [cid]
    );
    if (scrollR.rowCount === 0) return res.status(400).json({ error: '스크롤이 없습니다.' });
    const scroll = scrollR.rows[0];
    if (scroll.quantity <= 1) {
      await query('DELETE FROM character_inventory WHERE id = $1', [scroll.id]);
    } else {
      await query('UPDATE character_inventory SET quantity = quantity - 1 WHERE id = $1', [scroll.id]);
    }
    bonusChance = 0.10;
  }

  // 골드 원자적 차감 — 동시 소비 시 음수 방지. 차감 실패 시 400 반환
  const deductR = await query(
    'UPDATE characters SET gold = gold - $1 WHERE id = $2 AND gold >= $1',
    [info.cost, cid]
  );
  if (deductR.rowCount === 0) return res.status(400).json({ error: '골드가 부족합니다.' });

  // 확률 굴림
  const finalChance = Math.min(1.0, info.chance + bonusChance);
  const success = Math.random() < finalChance;

  // 일일퀘 강화 시도 카운트 (성공/실패 무관 매 시도 +1)
  try {
    const { trackDailyQuestProgress } = await import('./dailyQuests.js');
    await trackDailyQuestProgress(cid, 'enhance', 1);
  } catch {}

  if (success) {
    // enhance_level + 1, pity 0 으로 리셋 (다음 단계 시도용)
    if (parsed.data.kind === 'inventory') {
      await query(
        `UPDATE character_inventory SET enhance_level = enhance_level + 1, enhance_pity = 0
         WHERE character_id = $1 AND slot_index = $2`,
        [cid, parsed.data.slotKey]
      );
    } else {
      await query(
        `UPDATE character_equipped SET enhance_level = enhance_level + 1, enhance_pity = 0
         WHERE character_id = $1 AND slot = $2`,
        [cid, parsed.data.slotKey]
      );
    }
    // 10강 이상 성공 로그
    if (currentLevel >= 9) {
      await query(
        `INSERT INTO enhance_log (character_id, character_name, item_name, item_grade, from_level, to_level, success, destroyed)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE)`,
        [cid, char.name, itemName, itemGrade, currentLevel, currentLevel + 1]
      );
    }
    try {
      const newLv = currentLevel + 1;
      await query('UPDATE characters SET max_enhance_level = GREATEST(max_enhance_level, $1) WHERE id = $2', [newLv, cid]);
      const { checkAndUnlockAchievements } = await import('../game/achievements.js');
      await checkAndUnlockAchievements(cid);
    } catch {}
    await refreshSessionStats(cid).catch(() => {});
    res.json({
      success: true, destroyed: false, cost: info.cost, chance: finalChance,
      destroyRate: 0, newLevel: currentLevel + 1, pity: 0,
    });
  } else {
    // 파괴 폐지 — 단계 그대로. +21+ 만 pity 누적.
    let newPity = currentPity;
    if (currentLevel >= 20) {
      newPity = currentPity + 1;
      if (parsed.data.kind === 'inventory') {
        await query(
          `UPDATE character_inventory SET enhance_pity = enhance_pity + 1
            WHERE character_id = $1 AND slot_index = $2`,
          [cid, parsed.data.slotKey]
        );
      } else {
        await query(
          `UPDATE character_equipped SET enhance_pity = enhance_pity + 1
            WHERE character_id = $1 AND slot = $2`,
          [cid, parsed.data.slotKey]
        );
      }
    }
    // 10강 이상 실패 로그 (파괴 항상 false)
    if (currentLevel >= 9) {
      await query(
        `INSERT INTO enhance_log (character_id, character_name, item_name, item_grade, from_level, to_level, success, destroyed)
         VALUES ($1, $2, $3, $4, $5, NULL, FALSE, FALSE)`,
        [cid, char.name, itemName, itemGrade, currentLevel]
      );
    }
    res.json({
      success: false, destroyed: false, cost: info.cost, chance: finalChance,
      destroyRate: 0, newLevel: currentLevel, pity: newPity,
    });
  }
});

// 접두사 재굴림
router.post('/:characterId/reroll-prefix', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({
    kind: z.enum(['inventory', 'equipped']),
    slotKey: z.union([z.number().int().min(0), z.string()]),
    prefixIndex: z.number().int().min(0).max(2).optional(), // 단일 인덱스만 재굴림 (2~3옵에서 선택)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  // 재굴림권 소모
  const ticketR = await query<{ id: number; quantity: number }>(
    `SELECT ci.id, ci.quantity FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND i.name = '접두사 수치 재굴림권' AND ci.quantity > 0
     ORDER BY ci.slot_index LIMIT 1`,
    [cid]
  );
  if (ticketR.rowCount === 0) return res.status(400).json({ error: '접두사 수치 재굴림권이 없습니다.' });
  const ticket = ticketR.rows[0];
  if (ticket.quantity <= 1) {
    await query('DELETE FROM character_inventory WHERE id = $1', [ticket.id]);
  } else {
    await query('UPDATE character_inventory SET quantity = quantity - 1 WHERE id = $1', [ticket.id]);
  }

  // 대상 아이템 레벨 + 기존 prefix_ids/prefix_stats + 강화 레벨 + 유니크 고유옵 조회
  let targetItemLevel = 35;
  let existingPrefixIds: number[] = [];
  let existingPrefixStats: Record<string, number> = {};
  let targetEnhanceLevel = 0;
  let uniqueFixedStats: Record<string, number> = {};
  if (parsed.data.kind === 'inventory') {
    const ilr = await query<{ required_level: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; enhance_level: number; unique_prefix_stats: Record<string, number> | null; grade: string }>(
      `SELECT COALESCE(i.required_level, 1) AS required_level, ci.prefix_ids, ci.prefix_stats, ci.enhance_level, i.unique_prefix_stats, i.grade
       FROM character_inventory ci JOIN items i ON i.id = ci.item_id
       WHERE ci.character_id = $1 AND ci.slot_index = $2`, [cid, parsed.data.slotKey]);
    if (ilr.rows[0]) {
      targetItemLevel = ilr.rows[0].required_level;
      existingPrefixIds = ilr.rows[0].prefix_ids || [];
      existingPrefixStats = ilr.rows[0].prefix_stats || {};
      targetEnhanceLevel = ilr.rows[0].enhance_level || 0;
      if (ilr.rows[0].grade === 'unique') uniqueFixedStats = ilr.rows[0].unique_prefix_stats || {};
    }
  } else {
    const ilr = await query<{ required_level: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; enhance_level: number; unique_prefix_stats: Record<string, number> | null; grade: string }>(
      `SELECT COALESCE(i.required_level, 1) AS required_level, ce.prefix_ids, ce.prefix_stats, ce.enhance_level, i.unique_prefix_stats, i.grade
       FROM character_equipped ce JOIN items i ON i.id = ce.item_id
       WHERE ce.character_id = $1 AND ce.slot = $2`, [cid, parsed.data.slotKey]);
    if (ilr.rows[0]) {
      targetItemLevel = ilr.rows[0].required_level;
      existingPrefixIds = ilr.rows[0].prefix_ids || [];
      existingPrefixStats = ilr.rows[0].prefix_stats || {};
      targetEnhanceLevel = ilr.rows[0].enhance_level || 0;
      if (ilr.rows[0].grade === 'unique') uniqueFixedStats = ilr.rows[0].unique_prefix_stats || {};
    }
  }

  if (existingPrefixIds.length === 0) {
    return res.status(400).json({ error: '접두사가 없는 장비입니다.' });
  }

  // 유니크 고유옵은 prefix_stats에 병합 저장되어 있음 — 재굴림 전에 분리
  //   pureRandomStats = existingPrefixStats - uniqueFixedStats
  // 재굴림 후 uniqueFixedStats 를 다시 병합해서 저장
  const pureRandomStats: Record<string, number> = { ...existingPrefixStats };
  for (const [k, v] of Object.entries(uniqueFixedStats)) {
    if (pureRandomStats[k] !== undefined) {
      pureRandomStats[k] = pureRandomStats[k] - v;
      if (pureRandomStats[k] <= 0) delete pureRandomStats[k];
    }
  }

  // 기존 접두사의 tier/stat을 유지하고 값만 min~max 범위에서 재굴림
  // prefixIndex가 지정되면 그 인덱스 1개만, 없으면 전체 재굴림
  // 두 경우 모두 pureRandomStats 전달 — rollOne 실패 시 기존 값 유지 (방어적)
  const { prefixIds, bonusStats: rolledRandom } = await rerollPrefixValues(
    existingPrefixIds,
    targetItemLevel,
    parsed.data.prefixIndex !== undefined
      ? { targetIndex: parsed.data.prefixIndex, prevStats: pureRandomStats }
      : { prevStats: pureRandomStats },
  );

  // 유니크 고유옵 재병합
  const bonusStats: Record<string, number> = { ...rolledRandom };
  for (const [k, v] of Object.entries(uniqueFixedStats)) {
    bonusStats[k] = (bonusStats[k] ?? 0) + v;
  }

  // 대상 장비에 접두사 업데이트
  if (parsed.data.kind === 'inventory') {
    const r = await query(
      `UPDATE character_inventory SET prefix_ids = $1, prefix_stats = $2::jsonb
       WHERE character_id = $3 AND slot_index = $4 AND quantity = 1
       RETURNING slot_index`,
      [prefixIds, JSON.stringify(bonusStats), cid, parsed.data.slotKey]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'item not found' });
  } else {
    const r = await query(
      `UPDATE character_equipped SET prefix_ids = $1, prefix_stats = $2::jsonb
       WHERE character_id = $3 AND slot = $4
       RETURNING slot`,
      [prefixIds, JSON.stringify(bonusStats), cid, parsed.data.slotKey]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'item not found' });
  }

  // 강화 배수 적용해서 반환 (클라이언트는 /list 와 동일 포맷 기대)
  const displayStats = displayPrefixStats(bonusStats, targetEnhanceLevel);
  const rawStats = displayPrefixStats(bonusStats, 0);
  res.json({ success: true, prefixIds, prefixStats: displayStats, prefixStatsRaw: rawStats });
});

// 품질 재굴림 — 길드 보스 보상으로 지급되는 품질 재굴림권 소모
router.post('/:characterId/reroll-quality', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({
    kind: z.enum(['inventory', 'equipped']),
    slotKey: z.union([z.number().int().min(0), z.string()]),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  // 재굴림권 소모
  const ticketR = await query<{ id: number; quantity: number }>(
    `SELECT ci.id, ci.quantity FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND i.name = '품질 재굴림권' AND ci.quantity > 0
     ORDER BY ci.slot_index LIMIT 1`, [cid]
  );
  if (ticketR.rowCount === 0) return res.status(400).json({ error: '품질 재굴림권이 없습니다.' });
  const ticket = ticketR.rows[0];
  if (ticket.quantity <= 1) {
    await query('DELETE FROM character_inventory WHERE id = $1', [ticket.id]);
  } else {
    await query('UPDATE character_inventory SET quantity = quantity - 1 WHERE id = $1', [ticket.id]);
  }

  // 새 품질 굴림 (0~100)
  const newQuality = Math.floor(Math.random() * 101);

  if (parsed.data.kind === 'inventory') {
    const r = await query(
      `UPDATE character_inventory SET quality = $1
       WHERE character_id = $2 AND slot_index = $3
       RETURNING slot_index`,
      [newQuality, cid, parsed.data.slotKey]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'item not found' });
  } else {
    const r = await query(
      `UPDATE character_equipped SET quality = $1
       WHERE character_id = $2 AND slot = $3
       RETURNING slot`,
      [newQuality, cid, parsed.data.slotKey]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'item not found' });
  }

  res.json({ success: true, quality: newQuality });
});

// ============================================================
// T1/T2/T3 접두사 보장 추첨권 사용 — 지정 장비의 접두사 1개를 해당 tier 로 재굴림
// 공용 핸들러: tier 별 라우트가 thin wrapper 로 호출.
// body: { kind: 'inventory' | 'equipped', slotKey, prefixIndex }
// ============================================================
const TIER_TICKET_NAMES: Record<1 | 2 | 3, string> = {
  1: 'T1 접두사 보장 추첨권',
  2: 'T2 접두사 보장 추첨권',
  3: 'T3 접두사 보장 추첨권',
};

async function handleTierTicketUse(req: AuthedRequest, res: Response, tier: 1 | 2 | 3): Promise<void> {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) { res.status(404).json({ error: 'not found' }); return; }

  const parsed = z.object({
    kind: z.enum(['inventory', 'equipped']),
    slotKey: z.union([z.number().int().min(0), z.string()]),
    prefixIndex: z.number().int().min(0).max(2),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid input' }); return; }

  const ticketName = TIER_TICKET_NAMES[tier];

  const ticketR = await query<{ id: number; quantity: number }>(
    `SELECT ci.id, ci.quantity FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND i.name = $2 AND ci.quantity > 0
     ORDER BY ci.slot_index LIMIT 1`, [cid, ticketName]
  );
  if (ticketR.rowCount === 0) { res.status(400).json({ error: `${ticketName}이 없습니다.` }); return; }
  const ticket = ticketR.rows[0];

  const load = parsed.data.kind === 'inventory'
    ? await query<{ required_level: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; enhance_level: number; unique_prefix_stats: Record<string, number> | null; grade: string }>(
        `SELECT COALESCE(i.required_level, 1) AS required_level, ci.prefix_ids, ci.prefix_stats, ci.enhance_level, i.unique_prefix_stats, i.grade
         FROM character_inventory ci JOIN items i ON i.id = ci.item_id
         WHERE ci.character_id = $1 AND ci.slot_index = $2`, [cid, parsed.data.slotKey])
    : await query<{ required_level: number; prefix_ids: number[] | null; prefix_stats: Record<string, number> | null; enhance_level: number; unique_prefix_stats: Record<string, number> | null; grade: string }>(
        `SELECT COALESCE(i.required_level, 1) AS required_level, ce.prefix_ids, ce.prefix_stats, ce.enhance_level, i.unique_prefix_stats, i.grade
         FROM character_equipped ce JOIN items i ON i.id = ce.item_id
         WHERE ce.character_id = $1 AND ce.slot = $2`, [cid, parsed.data.slotKey]);
  if (!load.rowCount) { res.status(404).json({ error: 'item not found' }); return; }
  const row = load.rows[0];
  if (row.grade === 'unique') { res.status(400).json({ error: '유니크 장비는 사용 불가' }); return; }

  const prefixIds = row.prefix_ids || [];
  if (parsed.data.prefixIndex >= prefixIds.length) { res.status(400).json({ error: '존재하지 않는 접두사 인덱스' }); return; }

  const resolved = await resolvePrefixes(prefixIds);
  const targetStatKey = resolved[parsed.data.prefixIndex]?.statKey;
  if (!targetStatKey) { res.status(400).json({ error: '접두사 해석 실패' }); return; }

  const usedStats = new Set<string>();
  for (let i = 0; i < prefixIds.length; i++) {
    if (i === parsed.data.prefixIndex) continue;
    const sk = resolved[i]?.statKey;
    if (sk) usedStats.add(sk);
  }

  const rolled = await generateSinglePrefixOfTier(row.required_level, tier, usedStats);
  if (!rolled) { res.status(500).json({ error: `T${tier} 접두사 생성 실패` }); return; }

  const newIds = [...prefixIds];
  newIds[parsed.data.prefixIndex] = rolled.prefixId;
  const newStats: Record<string, number> = { ...(row.prefix_stats || {}) };
  delete newStats[targetStatKey];
  newStats[rolled.statKey] = (newStats[rolled.statKey] ?? 0) + rolled.value;

  if (ticket.quantity <= 1) {
    await query('DELETE FROM character_inventory WHERE id = $1', [ticket.id]);
  } else {
    await query('UPDATE character_inventory SET quantity = quantity - 1 WHERE id = $1', [ticket.id]);
  }

  if (parsed.data.kind === 'inventory') {
    await query(
      `UPDATE character_inventory SET prefix_ids = $1, prefix_stats = $2::jsonb WHERE character_id = $3 AND slot_index = $4`,
      [newIds, JSON.stringify(newStats), cid, parsed.data.slotKey]
    );
  } else {
    await query(
      `UPDATE character_equipped SET prefix_ids = $1, prefix_stats = $2::jsonb WHERE character_id = $3 AND slot = $4`,
      [newIds, JSON.stringify(newStats), cid, parsed.data.slotKey]
    );
    await refreshSessionStats(cid);
  }

  const enhanceLv = row.enhance_level || 0;
  res.json({
    success: true,
    prefixIds: newIds,
    prefixStats: displayPrefixStats(newStats, enhanceLv),
    prefixStatsRaw: displayPrefixStats(newStats, 0),
  });
}

router.post('/:characterId/use-t1-ticket', (req, res) => handleTierTicketUse(req as AuthedRequest, res, 1));
router.post('/:characterId/use-t2-ticket', (req, res) => handleTierTicketUse(req as AuthedRequest, res, 2));
router.post('/:characterId/use-t3-ticket', (req, res) => handleTierTicketUse(req as AuthedRequest, res, 3));

// ============================================================
// 3옵 보장 굴림권 사용 — 지정 장비의 접두사를 3개로 새로 굴림 (기존 접두사 모두 폐기)
// body: { kind, slotKey }
// ============================================================
router.post('/:characterId/use-3prefix-ticket', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const parsed = z.object({
    kind: z.enum(['inventory', 'equipped']),
    slotKey: z.union([z.number().int().min(0), z.string()]),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const ticketR = await query<{ id: number; quantity: number }>(
    `SELECT ci.id, ci.quantity FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND i.name = '3옵 보장 굴림권' AND ci.quantity > 0
     ORDER BY ci.slot_index LIMIT 1`, [cid]
  );
  if (ticketR.rowCount === 0) return res.status(400).json({ error: '3옵 보장 굴림권이 없습니다.' });
  const ticket = ticketR.rows[0];

  const load = parsed.data.kind === 'inventory'
    ? await query<{ required_level: number; grade: string; unique_prefix_stats: Record<string, number> | null; enhance_level: number }>(
        `SELECT COALESCE(i.required_level, 1) AS required_level, i.grade, i.unique_prefix_stats, ci.enhance_level
         FROM character_inventory ci JOIN items i ON i.id = ci.item_id
         WHERE ci.character_id = $1 AND ci.slot_index = $2`, [cid, parsed.data.slotKey])
    : await query<{ required_level: number; grade: string; unique_prefix_stats: Record<string, number> | null; enhance_level: number }>(
        `SELECT COALESCE(i.required_level, 1) AS required_level, i.grade, i.unique_prefix_stats, ce.enhance_level
         FROM character_equipped ce JOIN items i ON i.id = ce.item_id
         WHERE ce.character_id = $1 AND ce.slot = $2`, [cid, parsed.data.slotKey]);
  if (!load.rowCount) return res.status(404).json({ error: 'item not found' });
  const row = load.rows[0];
  if (row.grade === 'unique') return res.status(400).json({ error: '유니크 장비는 사용 불가' });

  const { prefixIds, bonusStats } = await generateGuaranteed3Prefixes(row.required_level);
  if (prefixIds.length < 3) return res.status(500).json({ error: '접두사 3개 생성 실패' });

  // 유니크 고유옵은 없는 일반 장비라 가정 (위에서 unique 차단)
  const newStats: Record<string, number> = { ...bonusStats };

  // 티켓 소모
  if (ticket.quantity <= 1) {
    await query('DELETE FROM character_inventory WHERE id = $1', [ticket.id]);
  } else {
    await query('UPDATE character_inventory SET quantity = quantity - 1 WHERE id = $1', [ticket.id]);
  }

  if (parsed.data.kind === 'inventory') {
    await query(
      `UPDATE character_inventory SET prefix_ids = $1, prefix_stats = $2::jsonb WHERE character_id = $3 AND slot_index = $4`,
      [prefixIds, JSON.stringify(newStats), cid, parsed.data.slotKey]
    );
  } else {
    await query(
      `UPDATE character_equipped SET prefix_ids = $1, prefix_stats = $2::jsonb WHERE character_id = $3 AND slot = $4`,
      [prefixIds, JSON.stringify(newStats), cid, parsed.data.slotKey]
    );
    await refreshSessionStats(cid);
  }

  const enhanceLv = row.enhance_level || 0;
  res.json({
    success: true,
    prefixIds,
    prefixStats: displayPrefixStats(newStats, enhanceLv),
    prefixStatsRaw: displayPrefixStats(newStats, 0),
  });
});

export default router;
