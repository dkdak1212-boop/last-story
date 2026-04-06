import { query } from '../db/pool.js';

export interface PrefixDef {
  id: number;
  name: string;
  tier: number;
  stat_key: string;
  min_val: number;
  max_val: number;
}

// 캐시 (서버 시작 시 1회 로드)
let prefixCache: PrefixDef[] | null = null;

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
export async function generatePrefixes(): Promise<{ prefixIds: number[]; bonusStats: Record<string, number> }> {
  const prefixes = await loadPrefixes();

  // 옵션 개수 결정
  const countRoll = Math.random() * 100;
  let count: number;
  if (countRoll < 1) count = 3;
  else if (countRoll < 10) count = 2;
  else count = 1;

  const prefixIds: number[] = [];
  const bonusStats: Record<string, number> = {};
  const usedStatKeys = new Set<string>();

  for (let i = 0; i < count; i++) {
    const tier = rollTier();
    // 해당 등급 접두사 중 아직 안 쓴 스탯키만 필터
    const candidates = prefixes.filter(p => p.tier === tier && !usedStatKeys.has(p.stat_key));
    if (candidates.length === 0) continue;

    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    const value = picked.min_val + Math.floor(Math.random() * (picked.max_val - picked.min_val + 1));

    prefixIds.push(picked.id);
    bonusStats[picked.stat_key] = (bonusStats[picked.stat_key] ?? 0) + value;
    usedStatKeys.add(picked.stat_key);
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
