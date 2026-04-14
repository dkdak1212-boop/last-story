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

// 표시용: 강화 레벨 적용된 접두사 스탯 계산 (강화당 +5%, 모든 키)
// inventory/enhance/marketplace UI 일관성을 위해 사용
export function displayPrefixStats(raw: unknown, enhanceLevel = 0): Record<string, number> {
  let stats: Record<string, number> = {};
  if (!raw) return stats;
  if (typeof raw === 'string') { try { stats = JSON.parse(raw); } catch { return {}; } }
  else if (typeof raw === 'object') stats = { ...(raw as Record<string, number>) };
  if (enhanceLevel > 0) {
    const mult = 1 + enhanceLevel * 0.05;
    for (const k of Object.keys(stats)) {
      stats[k] = Math.round(stats[k] * mult);
    }
  }
  return stats;
}

// 캐시 (서버 시작 시 1회 로드)
let prefixCache: PrefixDef[] | null = null;

export function clearPrefixCache() { prefixCache = null; }

async function loadPrefixes(): Promise<PrefixDef[]> {
  if (prefixCache) return prefixCache;
  const r = await query<PrefixDef>('SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes ORDER BY id');
  prefixCache = r.rows;
  return prefixCache;
}

// 등급별 확률: 1단계 90%, 2단계 9%, 3단계 0.9%, 4단계 0.1%
function rollTier(): number {
  const roll = Math.random() * 100;
  if (roll < 0.1) return 4;
  if (roll < 1.0) return 3;
  if (roll < 10.0) return 2;
  return 1;
}

// 접두사 1~3개 생성 (장비 아이템 드롭 시 호출)
// 1옵 90%, 2옵 9%, 3옵 1%
// itemLevel: 아이템 요구 레벨 (1~70). 접두사 값을 레벨 비례 스케일링
//   저렙(~10): 0.4~0.7배, 중렙(~35): 1.0배(기준), 고렙(50+): 1.3~1.8배
// 중복 접두사 발생 확률 (2옵/3옵 아이템에서 각 추가 옵션이 기존 stat_key와 겹칠 확률)
const DUPLICATE_PREFIX_CHANCE = 15; // %

export async function generatePrefixes(itemLevel: number = 35): Promise<{ prefixIds: number[]; bonusStats: Record<string, number>; maxTier: number }> {
  const prefixes = await loadPrefixes();
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
    const candidates = allowDuplicate
      ? prefixes.filter(p => p.tier === tier)
      : prefixes.filter(p => p.tier === tier && !usedStatKeys.has(p.stat_key));
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
export async function rerollPrefixValues(
  prefixIds: number[],
  itemLevel: number = 35,
): Promise<{ prefixIds: number[]; bonusStats: Record<string, number> }> {
  const prefixes = await loadPrefixes();
  const levelScale = 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
  const bonusStats: Record<string, number> = {};
  for (const pid of prefixIds) {
    const p = prefixes.find(x => x.id === pid);
    if (!p) continue;
    const baseValue = p.min_val + Math.floor(Math.random() * (p.max_val - p.min_val + 1));
    const value = Math.max(1, Math.round(baseValue * levelScale));
    bonusStats[p.stat_key] = (bonusStats[p.stat_key] ?? 0) + value;
  }
  return { prefixIds, bonusStats };
}

// prefix ID 배열 → 접두사 정보 조회
export async function resolvePrefixes(prefixIds: number[]): Promise<{ id: number; name: string; statKey: string; value: number }[]> {
  if (!prefixIds || prefixIds.length === 0) return [];
  const prefixes = await loadPrefixes();
  return prefixIds.map(pid => {
    const p = prefixes.find(x => x.id === pid);
    if (!p) return null;
    // value는 DB에 저장하지 않고 min~max 중간값 사용 (표시용)
    // 실제 값은 bonusStats에 저장됨
    return { id: p.id, name: p.name, statKey: p.stat_key, value: 0 };
  }).filter(Boolean) as { id: number; name: string; statKey: string; value: number }[];
}
