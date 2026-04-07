import { query } from '../db/pool.js';
import { computeEffective, sumEquipmentStats, sumNodeStats, type EffectiveStats } from './formulas.js';
import type { Stats } from './classes.js';

export interface PotionSettings {
  hpEnabled: boolean;
  hpThreshold: number;  // 0~100
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
  max_hp: number;
  node_points: number;
  stats: Stats;
  location: string;
  last_online_at: string;
  potion_settings: PotionSettings;
  inventory_slots_bonus: number;
  exp_boost_until: string | null;
}

export async function loadCharacter(id: number): Promise<CharacterRow | null> {
  const r = await query<CharacterRow>(
    `SELECT id, user_id, name, class_name, level, exp, gold, hp, max_hp,
            node_points, stats, location, last_online_at, potion_settings,
            inventory_slots_bonus, exp_boost_until
     FROM characters WHERE id = $1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return null;
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
  return r.rows.map(row => {
    const result: Partial<Stats> = {};
    if (row.stats) {
      // 강화 배율: +15%/단계 (기존 10%) + 7강 이후 가속
      const el = row.enhance_level || 0;
      const mult = el <= 6 ? (1 + el * 0.15) : (1 + 6 * 0.15 + (el - 6) * 0.25);
      for (const [k, v] of Object.entries(row.stats)) {
        result[k as keyof Stats] = Math.round((v as number) * mult);
      }
    }
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

export async function getNodeEffects(characterId: number) {
  const r = await query<{ effects: { type: string; stat?: string; key?: string; value: number }[] }>(
    `SELECT nd.effects FROM character_nodes cn
     JOIN node_definitions nd ON nd.id = cn.node_id
     WHERE cn.character_id = $1`,
    [characterId]
  );
  const allEffects: { type: string; stat?: string; key?: string; value: number }[] = [];
  for (const row of r.rows) {
    if (Array.isArray(row.effects)) {
      allEffects.push(...row.effects);
    }
  }
  return allEffects;
}

export async function getEffectiveStats(char: CharacterRow): Promise<EffectiveStats> {
  const equipped = await getEquippedItems(char.id);
  const bonus = sumEquipmentStats(equipped);
  const nodeEffects = await getNodeEffects(char.id);
  const nodeBonus = sumNodeStats(nodeEffects);
  return computeEffective(char.stats, char.max_hp, bonus, nodeBonus);
}

// 노드의 패시브 효과 목록 (전투 엔진에서 사용)
export async function getNodePassives(characterId: number): Promise<{ key: string; value: number }[]> {
  const effects = await getNodeEffects(characterId);
  return effects
    .filter(e => e.type === 'passive' && e.key)
    .map(e => ({ key: e.key!, value: e.value }));
}
