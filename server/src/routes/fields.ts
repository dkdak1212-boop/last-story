import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res) => {
  const r = await query<{
    id: number; name: string; requiredLevel: number; monsterPool: number[]; description: string;
  }>(
    `SELECT id, name, required_level AS "requiredLevel", monster_pool AS "monsterPool", description
     FROM fields ORDER BY required_level ASC`
  );

  // 모든 몬스터 ID 수집
  const allMonsterIds = [...new Set(r.rows.flatMap(f => f.monsterPool || []))];
  if (allMonsterIds.length === 0) return res.json(r.rows.map(f => ({ ...f, monsters: [] })));

  const mr = await query<{
    id: number; name: string; level: number; exp_reward: number; gold_reward: number;
    drop_table: { itemId: number; chance: number; minQty: number; maxQty: number }[] | null;
  }>(
    `SELECT id, name, level, exp_reward, gold_reward, drop_table FROM monsters WHERE id = ANY($1::int[])`,
    [allMonsterIds]
  );
  const monsterMap = new Map(mr.rows.map(m => [m.id, m]));

  // 드랍 아이템 이름 조회
  const allItemIds = [...new Set(mr.rows.flatMap(m => (m.drop_table || []).map(d => d.itemId)))];
  const itemNames = new Map<number, { name: string; grade: string }>();
  if (allItemIds.length > 0) {
    const ir = await query<{ id: number; name: string; grade: string }>(
      `SELECT id, name, grade FROM items WHERE id = ANY($1::int[])`, [allItemIds]
    );
    for (const i of ir.rows) itemNames.set(i.id, { name: i.name, grade: i.grade });
  }

  const result = r.rows.map(f => ({
    id: f.id,
    name: f.name,
    requiredLevel: f.requiredLevel,
    description: f.description,
    monsters: (f.monsterPool || []).map(mid => {
      const m = monsterMap.get(mid);
      if (!m) return null;
      return {
        name: m.name,
        level: m.level,
        exp: m.exp_reward,
        gold: m.gold_reward,
        drops: (m.drop_table || []).map(d => ({
          name: itemNames.get(d.itemId)?.name || `#${d.itemId}`,
          grade: itemNames.get(d.itemId)?.grade || 'common',
          chance: Math.round(d.chance * 1000) / 10, // % 표시
          minQty: d.minQty,
          maxQty: d.maxQty,
        })),
      };
    }).filter(Boolean),
  }));

  res.json(result);
});

export default router;
