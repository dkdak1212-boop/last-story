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
  auto_potion_enabled: boolean;
  auto_potion_threshold: number;
  auto_dismantle_common: boolean;
  title: string | null;
}

export async function loadCharacter(id: number): Promise<CharacterRow | null> {
  const r = await query<CharacterRow>(
    `SELECT id, user_id, name, class_name, level, exp, gold, hp, max_hp,
            node_points, COALESCE(stat_points, 0) AS stat_points,
            stats, location, last_online_at, potion_settings,
            inventory_slots_bonus, exp_boost_until,
            COALESCE(auto_potion_enabled, TRUE) AS auto_potion_enabled,
            COALESCE(auto_potion_threshold, 30) AS auto_potion_threshold,
            COALESCE(auto_dismantle_common, FALSE) AS auto_dismantle_common,
            title
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
  const r = await query<{ slot: string; stats: Partial<Stats> | null; enhance_level: number; prefix_stats: Record<string, number> | null; quality: number }>(
    `SELECT ce.slot, i.stats, ce.enhance_level, ce.prefix_stats, COALESCE(ce.quality, 0) AS quality
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id
     WHERE ce.character_id = $1`,
    [characterId]
  );
  return r.rows.map(row => {
    const result: Partial<Stats> = {};
    if (row.stats) {
      // 강화 배율 + 품질 보너스 (덧셈 합산: 강화로 품질이 두 배가 되지 않음)
      const el = row.enhance_level || 0;
      const enhMult = 1 + el * 0.075;
      const qualBonus = (row.quality || 0) / 100;
      const mult = enhMult + qualBonus;
      for (const [k, v] of Object.entries(row.stats)) {
        result[k as keyof Stats] = Math.round((v as number) * mult);
      }
    }
    if (row.prefix_stats) {
      const el = row.enhance_level || 0;
      const prefixMult = 1 + el * 0.05; // 강화당 접두사 +5% 스케일 (모든 스탯 적용)
      for (const [k, v] of Object.entries(row.prefix_stats)) {
        if (['str', 'dex', 'int', 'vit', 'spd', 'cri', 'hp', 'atk', 'matk', 'def', 'mdef'].includes(k)) {
          result[k as keyof Stats] = (result[k as keyof Stats] ?? 0) + Math.round((v as number) * prefixMult);
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

// 세트 효과 계산
async function getSetBonus(characterId: number): Promise<Partial<Stats>> {
  // 장착 중인 아이템의 set_id 조회
  const r = await query<{ set_id: number | null }>(
    `SELECT i.set_id FROM character_equipped ce JOIN items i ON i.id = ce.item_id WHERE ce.character_id = $1 AND i.set_id IS NOT NULL`,
    [characterId]
  );
  // set_id별 개수
  const counts = new Map<number, number>();
  for (const row of r.rows) {
    if (row.set_id) counts.set(row.set_id, (counts.get(row.set_id) || 0) + 1);
  }
  const totalBonus: Partial<Stats> = {};
  for (const [setId, count] of counts) {
    const setR = await query<{ set_bonus_2: Record<string, number>; set_bonus_4: Record<string, number>; set_bonus_6: Record<string, number> }>(
      'SELECT set_bonus_2, set_bonus_4, set_bonus_6 FROM item_sets WHERE id = $1', [setId]
    );
    if (setR.rowCount === 0) continue;
    const s = setR.rows[0];
    const bonuses: Record<string, number>[] = [];
    if (count >= 2) bonuses.push(s.set_bonus_2);
    if (count >= 4) bonuses.push(s.set_bonus_4);
    if (count >= 6) bonuses.push(s.set_bonus_6);
    for (const b of bonuses) {
      for (const [k, v] of Object.entries(b)) {
        totalBonus[k as keyof Stats] = (totalBonus[k as keyof Stats] ?? 0) + (v as number);
      }
    }
  }
  return totalBonus;
}

export async function getEffectiveStats(char: CharacterRow): Promise<EffectiveStats> {
  const equipped = await getEquippedItems(char.id);
  const bonus = sumEquipmentStats(equipped);
  const nodeEffects = await getNodeEffects(char.id);
  const nodeBonus = sumNodeStats(nodeEffects);
  const setBonus = await getSetBonus(char.id);
  // 세트 보너스를 노드 보너스에 합산
  const combinedNodeBonus: Partial<Stats> = { ...nodeBonus };
  for (const [k, v] of Object.entries(setBonus)) {
    combinedNodeBonus[k as keyof Stats] = (combinedNodeBonus[k as keyof Stats] ?? 0) + (v as number);
  }
  // 길드 HP 버프 (1%/단계)
  const { getGuildSkillsForCharacter, GUILD_SKILL_PCT } = await import('./guild.js');
  const gskills = await getGuildSkillsForCharacter(char.id);
  const guildHpBonus = gskills.hp * GUILD_SKILL_PCT.hp;
  const adjustedMaxHp = Math.round(char.max_hp * (1 + guildHpBonus / 100));
  const eff = computeEffective(char.stats, adjustedMaxHp, bonus, combinedNodeBonus);

  // 노드 패시브 적용 (전투 엔진 startCombatSession과 동일)
  const passiveEffects = nodeEffects.filter(e => e.type === 'passive' && e.key && e.value);
  const pMap = new Map<string, number>();
  for (const e of passiveEffects) pMap.set(e.key!, (pMap.get(e.key!) || 0) + e.value);
  if (pMap.has('war_god')) eff.atk = Math.round(eff.atk * (1 + pMap.get('war_god')! / 100));
  if (pMap.has('mana_overload')) eff.matk = Math.round(eff.matk * (1 + pMap.get('mana_overload')! / 100));
  if (pMap.has('iron_will')) eff.def = Math.round(eff.def * (1 + pMap.get('iron_will')! / 100));
  if (pMap.has('trickster')) eff.cri = Math.min(100, eff.cri + pMap.get('trickster')!);
  if (pMap.has('shadow_dance')) eff.dodge = Math.min(80, eff.dodge + pMap.get('shadow_dance')!);
  if (pMap.has('focus_mastery')) eff.accuracy = Math.min(200, eff.accuracy + pMap.get('focus_mastery')!);
  if (pMap.has('time_lord')) eff.spd = Math.round(eff.spd * (1 + pMap.get('time_lord')! / 100));
  if (pMap.has('berserker_heart')) {
    eff.atk = Math.round(eff.atk * (1 + pMap.get('berserker_heart')! / 100));
    eff.def = Math.round(eff.def * (1 - pMap.get('berserker_heart')! / 200));
  }
  if (pMap.has('sanctuary_guard')) eff.maxHp += Math.round(char.max_hp * pMap.get('sanctuary_guard')! / 100);
  if (pMap.has('balance_apostle')) {
    const v = pMap.get('balance_apostle')!;
    eff.atk = Math.round(eff.atk * (1 + v / 100));
    eff.matk = Math.round(eff.matk * (1 + v / 100));
    eff.def = Math.round(eff.def * (1 + v / 100));
  }
  // 유니크 접두사: atk_pct / matk_pct
  const equipPrefixes: Record<string, number> = {};
  for (const it of equipped) {
    if (!it.prefixStats) continue;
    for (const [k, v] of Object.entries(it.prefixStats)) {
      equipPrefixes[k] = (equipPrefixes[k] || 0) + (v as number);
    }
  }
  if (equipPrefixes.atk_pct) eff.atk = Math.round(eff.atk * (1 + equipPrefixes.atk_pct / 100));
  if (equipPrefixes.matk_pct) eff.matk = Math.round(eff.matk * (1 + equipPrefixes.matk_pct / 100));

  // 길드 stat_buff_pct: 모든 전투 능력치 % 증가 (atk/matk/def/mdef)
  const gbr = await query<{ stat_buff_pct: number }>(
    `SELECT g.stat_buff_pct FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id WHERE gm.character_id = $1`,
    [char.id]
  );
  if (gbr.rowCount && gbr.rowCount > 0 && Number(gbr.rows[0].stat_buff_pct) > 0) {
    const mult = 1 + Number(gbr.rows[0].stat_buff_pct) / 100;
    eff.atk = Math.round(eff.atk * mult);
    eff.matk = Math.round(eff.matk * mult);
    eff.def = Math.round(eff.def * mult);
    eff.mdef = Math.round(eff.mdef * mult);
  }
  return eff;
}

// 노드의 패시브 효과 목록 (전투 엔진에서 사용)
export async function getNodePassives(characterId: number): Promise<{ key: string; value: number }[]> {
  const effects = await getNodeEffects(characterId);
  return effects
    .filter(e => e.type === 'passive' && e.key)
    .map(e => ({ key: e.key!, value: e.value }));
}
