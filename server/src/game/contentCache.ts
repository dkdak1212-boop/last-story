import { query } from '../db/pool.js';

// 콘텐츠 테이블 (items / item_prefixes) 은 런타임 변경이 없어 서버 시작 시점
// 한 번 메모리에 적재 후 재사용. 마이그레이션으로 데이터가 추가되면 서버
// 재시작 시 재적재되므로 운영 흐름에 영향 없음.

export interface ItemDef {
  id: number;
  name: string;
  grade: string;
  slot: string | null;
  sell_price: number;
  required_level: number;
}

let itemsCache: Map<number, ItemDef> | null = null;
let prefixStatKeyCache: Map<number, string> | null = null;

async function ensureItemsCache(): Promise<Map<number, ItemDef>> {
  if (itemsCache) return itemsCache;
  const r = await query<{
    id: number; name: string; grade: string; slot: string | null;
    sell_price: number; required_level: number | null;
  }>(
    `SELECT id, name, grade, slot, sell_price, COALESCE(required_level, 1) AS required_level
     FROM items`
  );
  const m = new Map<number, ItemDef>();
  for (const row of r.rows) {
    m.set(row.id, {
      id: row.id,
      name: row.name,
      grade: row.grade,
      slot: row.slot,
      sell_price: row.sell_price,
      required_level: row.required_level ?? 1,
    });
  }
  itemsCache = m;
  return m;
}

async function ensurePrefixStatKeyCache(): Promise<Map<number, string>> {
  if (prefixStatKeyCache) return prefixStatKeyCache;
  const r = await query<{ id: number; stat_key: string }>('SELECT id, stat_key FROM item_prefixes');
  const m = new Map<number, string>();
  for (const row of r.rows) m.set(row.id, row.stat_key);
  prefixStatKeyCache = m;
  return m;
}

export async function getItemDef(id: number): Promise<ItemDef | null> {
  const m = await ensureItemsCache();
  return m.get(id) ?? null;
}

export async function getPrefixStatKeys(ids: number[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const m = await ensurePrefixStatKeyCache();
  const out: string[] = [];
  for (const id of ids) {
    const k = m.get(id);
    if (k) out.push(k);
  }
  return out;
}

// 마이그레이션/어드민 툴에서 직접 테이블을 고쳤을 때 수동 무효화용.
export function invalidateContentCache(): void {
  itemsCache = null;
  prefixStatKeyCache = null;
}
