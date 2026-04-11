import { query } from '../db/pool.js';

export interface GlobalEventMults {
  exp: number;
  gold: number;
  drop: number;
  active: boolean;
  name: string | null;
  endsAt: string | null;
}

let cache: { mults: GlobalEventMults; loadedAt: number } | null = null;
const CACHE_MS = 10_000;

const NEUTRAL: GlobalEventMults = { exp: 1, gold: 1, drop: 1, active: false, name: null, endsAt: null };

export async function getActiveGlobalEvent(): Promise<GlobalEventMults> {
  if (cache && Date.now() - cache.loadedAt < CACHE_MS) return cache.mults;
  try {
    const r = await query<{ name: string; exp_mult: string; gold_mult: string; drop_mult: string; ends_at: string }>(
      `SELECT name, exp_mult, gold_mult, drop_mult, ends_at
       FROM global_events WHERE ends_at > NOW() ORDER BY ends_at DESC LIMIT 1`
    );
    if (r.rowCount === 0) {
      cache = { mults: NEUTRAL, loadedAt: Date.now() };
      return NEUTRAL;
    }
    const row = r.rows[0];
    const mults: GlobalEventMults = {
      exp: Number(row.exp_mult),
      gold: Number(row.gold_mult),
      drop: Number(row.drop_mult),
      active: true,
      name: row.name,
      endsAt: row.ends_at,
    };
    cache = { mults, loadedAt: Date.now() };
    return mults;
  } catch {
    return NEUTRAL;
  }
}

export function invalidateGlobalEventCache() {
  cache = null;
}
