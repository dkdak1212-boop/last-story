import { query } from '../db/pool.js';

interface Achievement {
  id: number; code: string; name: string; description: string;
  condition_kind: string; condition_value: number; title_reward: string;
}

interface NewAchievement {
  name: string; title: string;
}

export async function checkAndUnlockAchievements(characterId: number): Promise<NewAchievement[]> {
  // 캐릭터 통계
  const charR = await query<{ level: number; total_kills: string; total_gold_earned: string; max_enhance_level: number }>(
    'SELECT level, total_kills, total_gold_earned, max_enhance_level FROM characters WHERE id = $1', [characterId]
  );
  if (charR.rowCount === 0) return [];
  const c = charR.rows[0];

  // PvP 승수
  const pvpR = await query<{ wins: number }>('SELECT COALESCE(wins, 0) as wins FROM pvp_stats WHERE character_id = $1', [characterId]);
  const pvpWins = pvpR.rows[0]?.wins ?? 0;

  // 미달성 업적
  const allAchievements = await query<Achievement>(
    `SELECT a.* FROM achievements a
     WHERE NOT EXISTS (SELECT 1 FROM character_achievements ca WHERE ca.character_id = $1 AND ca.achievement_id = a.id)`,
    [characterId]
  );

  const stats: Record<string, number> = {
    level: c.level,
    total_kills: Number(c.total_kills),
    total_gold_earned: Number(c.total_gold_earned),
    max_enhance: c.max_enhance_level,
    pvp_wins: pvpWins,
    first_login: 1,
  };

  const newlyUnlocked: NewAchievement[] = [];

  for (const a of allAchievements.rows) {
    const current = stats[a.condition_kind] ?? 0;
    if (current >= a.condition_value) {
      await query(
        'INSERT INTO character_achievements (character_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [characterId, a.id]
      );
      newlyUnlocked.push({ name: a.name, title: a.title_reward });
    }
  }

  return newlyUnlocked;
}
