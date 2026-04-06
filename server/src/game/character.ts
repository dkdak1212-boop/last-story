import { query } from '../db/pool.js';
import { computeEffective, sumEquipmentStats, type EffectiveStats } from './formulas.js';
import type { Stats } from './classes.js';

export interface PotionSettings {
  hpEnabled: boolean;
  hpThreshold: number;  // 0~100
  mpEnabled: boolean;
  mpThreshold: number;
}

export interface CharacterRow {
  id: number;
  user_id: number;
  name: string;
  class_name: string;
  level: number;
  exp: number;
  gold: number;
  hp: number;
  mp: number;
  max_hp: number;
  max_mp: number;
  stats: Stats;
  location: string;
  last_online_at: string;
  potion_settings: PotionSettings;
  inventory_slots_bonus: number;
  exp_boost_until: string | null;
}

export async function loadCharacter(id: number): Promise<CharacterRow | null> {
  const r = await query<CharacterRow>(
    `SELECT id, user_id, name, class_name, level, exp, gold, hp, mp, max_hp, max_mp,
            stats, location, last_online_at, potion_settings,
            inventory_slots_bonus, exp_boost_until
     FROM characters WHERE id = $1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return null;
  // BIGINT는 pg에서 문자열로 반환됨 → Number로 변환
  row.exp = Number(row.exp);
  row.gold = Number(row.gold);
  return row;
}

export async function loadCharacterOwned(id: number, userId: number): Promise<CharacterRow | null> {
  const c = await loadCharacter(id);
  if (!c || c.user_id !== userId) return null;
  return c;
}

export async function getEquippedItems(characterId: number) {
  const r = await query<{ slot: string; stats: Partial<Stats> | null; enhance_level: number; prefix_stats: Record<string, number> | null }>(
    `SELECT ce.slot, i.stats, ce.enhance_level, ce.prefix_stats
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id
     WHERE ce.character_id = $1`,
    [characterId]
  );
  // 강화 레벨 적용 + 접두사 보너스 합산
  return r.rows.map(row => {
    const result: Partial<Stats> = {};
    if (row.stats) {
      const mult = 1 + (row.enhance_level || 0) * 0.1;
      for (const [k, v] of Object.entries(row.stats)) {
        result[k as keyof Stats] = Math.round((v as number) * mult);
      }
    }
    // 접두사 보너스 (str, dex, int, vit, spd, cri는 직접 합산)
    if (row.prefix_stats) {
      for (const [k, v] of Object.entries(row.prefix_stats)) {
        if (['str', 'dex', 'int', 'vit', 'spd', 'cri'].includes(k)) {
          result[k as keyof Stats] = (result[k as keyof Stats] ?? 0) + (v as number);
        }
      }
    }
    return { stats: Object.keys(result).length > 0 ? result : null, prefixStats: row.prefix_stats };
  });
}

export async function getEffectiveStats(char: CharacterRow): Promise<EffectiveStats> {
  const equipped = await getEquippedItems(char.id);
  const bonus = sumEquipmentStats(equipped);
  return computeEffective(char.stats, char.max_hp, char.max_mp, bonus);
}
