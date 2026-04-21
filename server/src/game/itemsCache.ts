import { query } from '../db/pool.js';

export interface CachedItem {
  id: number;
  name: string;
  stack_size: number;
  slot: string | null;
  required_level: number;
  grade: string;
  unique_prefix_stats: Record<string, number> | null;
}

const cache = new Map<number, CachedItem>();
let loaded = false;

export async function loadItemsCache(): Promise<void> {
  const r = await query<CachedItem>(
    `SELECT id, name, stack_size, slot,
            COALESCE(required_level, 1) AS required_level,
            grade, unique_prefix_stats
       FROM items`
  );
  cache.clear();
  for (const row of r.rows) cache.set(row.id, row);
  loaded = true;
  console.log(`[items-cache] loaded ${cache.size} items`);
}

export function getCachedItem(id: number): CachedItem | null {
  return cache.get(id) ?? null;
}

export function isItemsCacheLoaded(): boolean {
  return loaded;
}
