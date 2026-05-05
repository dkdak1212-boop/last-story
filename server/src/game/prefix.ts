import { query } from '../db/pool.js';

export interface PrefixDef {
  id: number;
  name: string;
  tier: number;
  stat_key: string;
  min_val: number;
  max_val: number;
}

// 강화 시 접두사도 스케일링되는 스탯 키 (기본 스탯만)
export const SCALABLE_PREFIX_STATS = new Set(['str', 'dex', 'int', 'vit', 'spd', 'cri', 'accuracy', 'dodge', 'hp_regen']);

// 표시용: 강화 레벨 적용된 접두사 스탯 계산 (강화당 +2.5%, 모든 키)
// inventory/enhance/marketplace UI 일관성을 위해 사용
export function displayPrefixStats(raw: unknown, enhanceLevel = 0): Record<string, number> {
  let stats: Record<string, number> = {};
  if (!raw) return stats;
  if (typeof raw === 'string') { try { stats = JSON.parse(raw); } catch { return {}; } }
  else if (typeof raw === 'object') stats = { ...(raw as Record<string, number>) };
  if (enhanceLevel > 0) {
    const mult = 1 + enhanceLevel * 0.025;
    for (const k of Object.keys(stats)) {
      stats[k] = Math.round(stats[k] * mult);
    }
  }
  return stats;
}

// 캐시 (서버 시작 시 1회 로드) + tier 별·id 별 인덱스
// 핫패스: 드랍 시 매번 prefixes.filter(p => p.tier === t) 가 전체 배열을 훑었음 → tier 인덱스로 즉시 조회
//         resolve/reroll 핫패스: prefixes.find(x => x.id === pid) 또한 O(n) → id 맵으로 전환
let prefixCache: PrefixDef[] | null = null;
let prefixesByTier: Map<number, PrefixDef[]> | null = null;
let prefixesById: Map<number, PrefixDef> | null = null;

export function clearPrefixCache() { prefixCache = null; prefixesByTier = null; prefixesById = null; }

function buildTierIndex(arr: PrefixDef[]): Map<number, PrefixDef[]> {
  const m = new Map<number, PrefixDef[]>();
  for (const p of arr) {
    const arr2 = m.get(p.tier);
    if (arr2) arr2.push(p); else m.set(p.tier, [p]);
  }
  return m;
}

function buildIdIndex(arr: PrefixDef[]): Map<number, PrefixDef> {
  const m = new Map<number, PrefixDef>();
  for (const p of arr) m.set(p.id, p);
  return m;
}

async function loadPrefixes(): Promise<PrefixDef[]> {
  if (prefixCache) return prefixCache;
  const r = await query<PrefixDef>('SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes ORDER BY id');
  prefixCache = r.rows;
  prefixesByTier = buildTierIndex(prefixCache);
  prefixesById = buildIdIndex(prefixCache);
  return prefixCache;
}

// 티어 그룹을 usedStatKeys 기준으로 필터링한 후보 반환 (allowDuplicate 가 true면 그룹 그대로)
function tierCandidates(tier: number, usedStatKeys: Set<string> | null): PrefixDef[] {
  const group = prefixesByTier?.get(tier);
  if (!group || group.length === 0) return [];
  if (!usedStatKeys || usedStatKeys.size === 0) return group;
  const out: PrefixDef[] = [];
  for (const p of group) if (!usedStatKeys.has(p.stat_key)) out.push(p);
  return out;
}

// 등급별 확률: 1단계 90%, 2단계 9%, 3단계 0.9%, 4단계 0.1%
function rollTier(): number {
  const roll = Math.random() * 100;
  if (roll < 0.1) return 4;
  if (roll < 1.0) return 3;
  if (roll < 10.0) return 2;
  return 1;
}

// T1 제외 분포 — 원본 9:0.9:0.1 정규화 → T2 90%, T3 9%, T4 1%
function rollTierMinT2(): number {
  const roll = Math.random() * 100;
  if (roll < 1.0) return 4;
  if (roll < 10.0) return 3;
  return 2;
}

// 접두사 1~3개 생성 (장비 아이템 드롭 시 호출)
// 1옵 90%, 2옵 9%, 3옵 1%
// itemLevel: 아이템 요구 레벨 (1~70). 접두사 값을 레벨 비례 스케일링
//   저렙(~10): 0.4~0.7배, 중렙(~35): 1.0배(기준), 고렙(50+): 1.3~1.8배
// 중복 접두사 발생 확률 (2옵/3옵 아이템에서 각 추가 옵션이 기존 stat_key와 겹칠 확률)
const DUPLICATE_PREFIX_CHANCE = 15; // %

export async function generatePrefixes(itemLevel: number = 35): Promise<{ prefixIds: number[]; bonusStats: Record<string, number>; maxTier: number }> {
  await loadPrefixes(); // tier 인덱스 보장
  // 레벨 스케일 팩터: lv35 = 1.0 기준
  const levelScale = 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;

  // 옵션 개수 결정
  const countRoll = Math.random() * 100;
  let count: number;
  if (countRoll < 1) count = 3;
  else if (countRoll < 10) count = 2;
  else count = 1;

  const prefixIds: number[] = [];
  const bonusStats: Record<string, number> = {};
  const usedStatKeys = new Set<string>();
  let maxTier = 0;

  for (let i = 0; i < count; i++) {
    const tier = rollTier();
    // 첫 번째는 무조건 새 스탯, 이후는 확률적으로 중복 허용
    const allowDuplicate = i > 0 && Math.random() * 100 < DUPLICATE_PREFIX_CHANCE;
    const candidates = tierCandidates(tier, allowDuplicate ? null : usedStatKeys);
    if (candidates.length === 0) continue;

    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    const baseValue = picked.min_val + Math.floor(Math.random() * (picked.max_val - picked.min_val + 1));
    const value = Math.max(1, Math.round(baseValue * levelScale));

    prefixIds.push(picked.id);
    bonusStats[picked.stat_key] = (bonusStats[picked.stat_key] ?? 0) + value;
    usedStatKeys.add(picked.stat_key);
    if (picked.tier > maxTier) maxTier = picked.tier;
  }

  return { prefixIds, bonusStats, maxTier };
}

// 기존 접두사의 tier/stat_key는 유지하고 값(value)만 min~max 범위로 재굴림
// 재굴림권 사용 시 호출 — 기존 옵션 구성을 보존하고 수치만 새로 굴림
//
// targetIndex가 지정되면 prefixIds 배열의 그 인덱스에 해당하는 접두사 1개만 재굴림하고
// 나머지는 prevStats(기존 prefix_stats)에서 그대로 유지한다.
// targetIndex가 가리키는 접두사와 동일 stat_key를 공유하는 다른 접두사가 있으면
// 어차피 합산되어 분리할 수 없으므로 그 stat_key 전체가 함께 재굴림된다.
// 지정된 tier의 랜덤 접두사 1개를 생성 (excludeStatKeys 에 있는 stat_key는 제외)
export async function generateSinglePrefixOfTier(
  itemLevel: number,
  tier: number,
  excludeStatKeys: Set<string> = new Set(),
): Promise<{ prefixId: number; statKey: string; value: number } | null> {
  await loadPrefixes();
  const levelScale = 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
  let candidates = tierCandidates(tier, excludeStatKeys);
  if (candidates.length === 0) candidates = prefixesByTier?.get(tier) ?? [];
  if (candidates.length === 0) return null;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  const baseValue = picked.min_val + Math.floor(Math.random() * (picked.max_val - picked.min_val + 1));
  const value = Math.max(1, Math.round(baseValue * levelScale));
  return { prefixId: picked.id, statKey: picked.stat_key, value };
}

// 차원새싹상자 전용 — T1 또는 T2 랜덤, 중복 없는 3옵 강제 생성
export async function generate3PrefixesT1T2(
  itemLevel: number,
): Promise<{ prefixIds: number[]; bonusStats: Record<string, number>; maxTier: number }> {
  await loadPrefixes();
  const levelScale = 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
  const prefixIds: number[] = [];
  const bonusStats: Record<string, number> = {};
  const usedStatKeys = new Set<string>();
  let maxTier = 0;
  for (let i = 0; i < 3; i++) {
    const tier = Math.random() < 0.5 ? 1 : 2;
    let candidates = tierCandidates(tier, usedStatKeys);
    if (candidates.length === 0) candidates = prefixesByTier?.get(tier) ?? [];
    if (candidates.length === 0) continue;
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    const baseValue = picked.min_val + Math.floor(Math.random() * (picked.max_val - picked.min_val + 1));
    const value = Math.max(1, Math.round(baseValue * levelScale));
    prefixIds.push(picked.id);
    bonusStats[picked.stat_key] = (bonusStats[picked.stat_key] ?? 0) + value;
    usedStatKeys.add(picked.stat_key);
    if (picked.tier > maxTier) maxTier = picked.tier;
  }
  return { prefixIds, bonusStats, maxTier };
}

// 3옵 보장 — 지정된 stat_key 중복 없이 새 prefix 3개 생성 (tier는 정상 확률 분포)
// minTier: 옵션 — 지정 시 해당 티어 미만은 굴리지 않음 (예: 거래소 미확인 구매 = T2 이상)
export async function generateGuaranteed3Prefixes(
  itemLevel: number,
  minTier: 1 | 2 = 1,
): Promise<{ prefixIds: number[]; bonusStats: Record<string, number>; maxTier: number }> {
  await loadPrefixes();
  const levelScale = 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
  const prefixIds: number[] = [];
  const bonusStats: Record<string, number> = {};
  const usedStatKeys = new Set<string>();
  let maxTier = 0;
  const tierFn = minTier >= 2 ? rollTierMinT2 : rollTier;
  for (let i = 0; i < 3; i++) {
    const tier = tierFn();
    let candidates = tierCandidates(tier, usedStatKeys);
    if (candidates.length === 0) candidates = prefixesByTier?.get(tier) ?? [];
    if (candidates.length === 0) continue;
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    const baseValue = picked.min_val + Math.floor(Math.random() * (picked.max_val - picked.min_val + 1));
    const value = Math.max(1, Math.round(baseValue * levelScale));
    prefixIds.push(picked.id);
    bonusStats[picked.stat_key] = (bonusStats[picked.stat_key] ?? 0) + value;
    usedStatKeys.add(picked.stat_key);
    if (picked.tier > maxTier) maxTier = picked.tier;
  }
  return { prefixIds, bonusStats, maxTier };
}

// 단일 슬롯 보장 티어 재굴림 — 추첨권(T1/T2/T3) 공통.
// 다른 두 슬롯은 prefix_id·기여 값 그대로 보존.
export async function rerollSinglePrefixForcedTier(
  currentPrefixIds: number[],
  currentStats: Record<string, number>,
  uniqueStats: Record<string, number> | null,
  targetIndex: number,
  itemLevel: number,
  forceTier: number,                                 // 1 | 2 | 3
): Promise<{ prefixIds: number[]; bonusStats: Record<string, number>; oldName: string; newName: string; tier: number }> {
  if (targetIndex < 0 || targetIndex >= currentPrefixIds.length) {
    throw new Error('invalid prefix index');
  }
  await loadPrefixes();
  const levelScale = 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;

  const oldPrefix = prefixesById?.get(currentPrefixIds[targetIndex]);
  if (!oldPrefix) throw new Error('old prefix not found in cache');
  const oldKey = oldPrefix.stat_key;
  const uniqueVal = uniqueStats?.[oldKey] || 0;
  const oldSlotValue = Math.max(0, (currentStats[oldKey] || 0) - uniqueVal);

  // 다른 슬롯 stat_key 수집 — 중복 stat 차단
  const otherKeys = new Set<string>();
  for (let i = 0; i < currentPrefixIds.length; i++) {
    if (i === targetIndex) continue;
    const p = prefixesById?.get(currentPrefixIds[i]);
    if (p) otherKeys.add(p.stat_key);
  }
  // 강제 티어 후보 (다른 슬롯 stat 과 안 겹침)
  let candidates = tierCandidates(forceTier, otherKeys);
  if (candidates.length === 0) candidates = prefixesByTier?.get(forceTier) ?? [];
  if (candidates.length === 0) throw new Error(`no T${forceTier} prefix available`);

  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  const baseValue = picked.min_val + Math.floor(Math.random() * (picked.max_val - picked.min_val + 1));
  const newValue = Math.max(1, Math.round(baseValue * levelScale));

  const newPrefixIds = [...currentPrefixIds];
  newPrefixIds[targetIndex] = picked.id;

  // bonusStats — 옛 슬롯 기여 빼고 새 슬롯 더하기 (unique 부분은 보존)
  const newStats: Record<string, number> = { ...currentStats };
  if (oldKey === picked.stat_key) {
    // 같은 키 재굴림 — 옛 값 빼고 새 값 더함 (net 만 반영)
    newStats[oldKey] = (newStats[oldKey] || 0) - oldSlotValue + newValue;
  } else {
    if (oldSlotValue > 0) {
      newStats[oldKey] = (newStats[oldKey] || 0) - oldSlotValue;
      if ((newStats[oldKey] || 0) <= 0) delete newStats[oldKey];
    }
    newStats[picked.stat_key] = (newStats[picked.stat_key] || 0) + newValue;
  }

  return { prefixIds: newPrefixIds, bonusStats: newStats, oldName: oldPrefix.name, newName: picked.name, tier: picked.tier };
}

// 호환 wrapper — 기존 T3 호출처 보존
export async function rerollSinglePrefixT3(
  currentPrefixIds: number[],
  currentStats: Record<string, number>,
  uniqueStats: Record<string, number> | null,
  targetIndex: number,
  itemLevel: number,
) {
  return rerollSinglePrefixForcedTier(currentPrefixIds, currentStats, uniqueStats, targetIndex, itemLevel, 3);
}

// T3 보장 + 나머지 2 옵 무작위 (T1~T4 분포 그대로). 추첨권 사용 시.
export async function generateT3Guaranteed3Prefixes(
  itemLevel: number,
): Promise<{ prefixIds: number[]; bonusStats: Record<string, number>; maxTier: number }> {
  await loadPrefixes();
  const levelScale = 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
  const prefixIds: number[] = [];
  const bonusStats: Record<string, number> = {};
  const usedStatKeys = new Set<string>();
  let maxTier = 0;

  // 슬롯 0: T3 강제
  const t3Cands = prefixesByTier?.get(3) ?? [];
  if (t3Cands.length > 0) {
    const picked = t3Cands[Math.floor(Math.random() * t3Cands.length)];
    const baseValue = picked.min_val + Math.floor(Math.random() * (picked.max_val - picked.min_val + 1));
    const value = Math.max(1, Math.round(baseValue * levelScale));
    prefixIds.push(picked.id);
    bonusStats[picked.stat_key] = (bonusStats[picked.stat_key] ?? 0) + value;
    usedStatKeys.add(picked.stat_key);
    if (picked.tier > maxTier) maxTier = picked.tier;
  }

  // 슬롯 1, 2: 일반 분포 (rollTier — T1 90% / T2 9% / T3 0.9% / T4 0.1%)
  for (let i = 0; i < 2; i++) {
    const tier = rollTier();
    let candidates = tierCandidates(tier, usedStatKeys);
    if (candidates.length === 0) candidates = prefixesByTier?.get(tier) ?? [];
    if (candidates.length === 0) continue;
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    const baseValue = picked.min_val + Math.floor(Math.random() * (picked.max_val - picked.min_val + 1));
    const value = Math.max(1, Math.round(baseValue * levelScale));
    prefixIds.push(picked.id);
    bonusStats[picked.stat_key] = (bonusStats[picked.stat_key] ?? 0) + value;
    usedStatKeys.add(picked.stat_key);
    if (picked.tier > maxTier) maxTier = picked.tier;
  }

  return { prefixIds, bonusStats, maxTier };
}

export async function rerollPrefixValues(
  prefixIds: number[],
  itemLevel: number = 35,
  options: { targetIndex?: number; prevStats?: Record<string, number> } = {},
): Promise<{ prefixIds: number[]; bonusStats: Record<string, number> }> {
  // 캐시가 stale 하여 새로 추가된 prefix가 누락된 경우를 대비해
  // prefixIds 중 하나라도 캐시에서 빠져 있으면 캐시 재로딩.
  await loadPrefixes();
  if (prefixIds.some(pid => !prefixesById?.has(pid))) {
    clearPrefixCache();
    await loadPrefixes();
  }
  const levelScale = 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
  const { targetIndex, prevStats } = options;

  const rollOne = (pid: number): { stat: string; value: number } | null => {
    const p = prefixesById?.get(pid);
    if (!p) return null;
    const baseValue = p.min_val + Math.floor(Math.random() * (p.max_val - p.min_val + 1));
    const value = Math.max(1, Math.round(baseValue * levelScale));
    return { stat: p.stat_key, value };
  };

  // 단일 인덱스 재굴림 — 기존 prevStats는 방어적으로 보존
  if (targetIndex !== undefined && targetIndex >= 0 && targetIndex < prefixIds.length && prevStats) {
    const targetPid = prefixIds[targetIndex];
    const targetPrefix = prefixesById?.get(targetPid);
    if (!targetPrefix) {
      return { prefixIds, bonusStats: { ...prevStats } };
    }
    const targetStat = targetPrefix.stat_key;
    // 동일 stat_key를 공유하는 다른 인덱스도 함께 새로 굴림 (분리 불가)
    const sharedIndices: { pid: number; i: number }[] = [];
    for (let i = 0; i < prefixIds.length; i++) {
      const pid = prefixIds[i];
      if (prefixesById?.get(pid)?.stat_key === targetStat) sharedIndices.push({ pid, i });
    }

    const next: Record<string, number> = { ...prevStats };
    let accumulated = 0;
    let rolled = false;
    for (const { pid } of sharedIndices) {
      const r = rollOne(pid);
      if (r) { accumulated += r.value; rolled = true; }
    }
    // 실제로 한 번이라도 굴렸을 때만 대체 — 실패하면 기존 값 유지
    if (rolled) next[targetStat] = accumulated;
    return { prefixIds, bonusStats: next };
  }

  // 전체 재굴림 — 기존 prevStats를 base 로 사용해 rollOne 실패 시 기존값 유지
  const bonusStats: Record<string, number> = { ...(prevStats || {}) };
  // 먼저 이번에 굴릴 stat_key 들을 0 으로 초기화 (굴림 성공 시 누적 대체)
  const rolledKeys = new Set<string>();
  for (const pid of prefixIds) {
    const p = prefixesById?.get(pid);
    if (p) rolledKeys.add(p.stat_key);
  }
  for (const k of rolledKeys) bonusStats[k] = 0;
  let anyRolled = false;
  for (const pid of prefixIds) {
    const r = rollOne(pid);
    if (!r) continue;
    anyRolled = true;
    bonusStats[r.stat] = (bonusStats[r.stat] ?? 0) + r.value;
  }
  // 하나도 못 굴리면 원래 값 유지
  if (!anyRolled && prevStats) return { prefixIds, bonusStats: { ...prevStats } };
  // 0으로 초기화 후 실제로 굴리지 못해 0 남은 키는 기존값으로 복원
  if (prevStats) {
    for (const k of rolledKeys) {
      if (bonusStats[k] === 0 && prevStats[k] !== undefined) bonusStats[k] = prevStats[k];
    }
  }
  return { prefixIds, bonusStats };
}

// prefix ID 배열 → 접두사 정보 조회
export async function resolvePrefixes(prefixIds: number[]): Promise<{ id: number; name: string; statKey: string; value: number }[]> {
  if (!prefixIds || prefixIds.length === 0) return [];
  await loadPrefixes();
  const out: { id: number; name: string; statKey: string; value: number }[] = [];
  for (const pid of prefixIds) {
    const p = prefixesById?.get(pid);
    if (!p) continue;
    // value는 DB에 저장하지 않고 min~max 중간값 사용 (표시용)
    // 실제 값은 bonusStats에 저장됨
    out.push({ id: p.id, name: p.name, statKey: p.stat_key, value: 0 });
  }
  return out;
}

// 동기 — 메모리 캐시만 사용. 캐시 미준비 시 빈 배열 (드랍 로그용 사소한 경로).
// addItemToInventory 의 special drop 경로에서 매 호출당 SELECT name FROM item_prefixes 절감.
export function getPrefixNamesSync(prefixIds: number[]): string[] {
  if (!prefixIds || prefixIds.length === 0) return [];
  if (!prefixesById) return [];
  const out: string[] = [];
  for (const pid of prefixIds) {
    const p = prefixesById.get(pid);
    if (p) out.push(p.name);
  }
  return out;
}
