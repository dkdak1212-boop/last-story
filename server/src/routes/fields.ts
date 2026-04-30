import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  // 시공의 균열(23) 잔여 시간 표시를 위해 캐릭 id 옵션. 없으면 riftRemainMs 미포함.
  const charIdRaw = req.query.characterId;
  const charId = typeof charIdRaw === 'string' ? Number(charIdRaw) : NaN;
  let riftRemainMs: number | null = null;
  if (Number.isInteger(charId) && charId > 0) {
    try {
      const r = await query<{ rea: string | null }>(
        'SELECT rift_entered_at::text AS rea FROM characters WHERE id = $1', [charId]
      );
      const enteredMs = r.rows[0]?.rea ? new Date(r.rows[0].rea).getTime() : 0;
      if (enteredMs > 0) {
        const remain = enteredMs + 30 * 60_000 - Date.now();
        if (remain > 0) riftRemainMs = remain;
      }
    } catch { /* ignore */ }
  }

  const r = await query<{
    id: number; name: string; requiredLevel: number; monsterPool: number[]; description: string;
  }>(
    `SELECT id, name, required_level AS "requiredLevel", monster_pool AS "monsterPool", description
     FROM fields
     WHERE id != 999 -- id=999는 길드 보스 전용 (사냥터 목록 미노출). 종언의 기둥(1000)·시공의 균열(23)은 노출.
     ORDER BY required_level ASC`
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

  // 영토 점령 정보
  const tr = await query<{ field_id: number; owner_name: string | null }>(
    `SELECT t.field_id, g.name AS owner_name
     FROM guild_territories t LEFT JOIN guilds g ON g.id = t.owner_guild_id`
  );
  const ownerMap = new Map<number, string | null>();
  for (const row of tr.rows) ownerMap.set(row.field_id, row.owner_name);

  const result = r.rows.map(f => ({
    id: f.id,
    name: f.name,
    requiredLevel: f.requiredLevel,
    description: f.description,
    ownerGuildName: ownerMap.get(f.id) || null,
    monsters: (f.monsterPool || []).map(mid => {
      const m = monsterMap.get(mid);
      if (!m) return null;
      // gold/exp 모두 base (레벨차 페널티·부스트·접두사 제외된 기준값)
      return {
        name: m.name,
        level: m.level,
        exp: m.exp_reward,
        gold: m.gold_reward,
        drops: (m.drop_table || []).map(d => {
          const grade = itemNames.get(d.itemId)?.grade || 'common';
          // 유니크는 DROP_RATE_MULT(0.1) 제외, 나머지는 적용
          const mult = grade === 'unique' ? 1.0 : 0.1;
          return {
            name: itemNames.get(d.itemId)?.name || `#${d.itemId}`,
            grade,
            chance: d.chance * mult * 100, // % (원시 정밀도, 표시는 클라이언트에서)
            minQty: d.minQty,
            maxQty: d.maxQty,
          };
        }),
      };
    }).filter(Boolean),
  }));

  res.json({ fields: result, riftRemainMs });
});

export default router;
