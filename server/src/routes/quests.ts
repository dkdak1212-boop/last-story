import { Router, type Response } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { addItemToInventory, deliverToMailbox } from '../game/inventory.js';

const router = Router();
router.use(authRequired);

// 퀘스트 목록 (사용 가능 + 내 진행 상태)
router.get('/:id/quests', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const r = await query<{
    id: number; name: string; description: string; required_level: number;
    target_kind: string; target_id: number; target_count: number;
    reward_exp: number; reward_gold: number; reward_item_id: number | null; reward_item_qty: number | null;
    reward_item_id2: number | null; reward_item_qty2: number | null; reward_item2_name: string | null;
    progress: number | null; completed: boolean | null; claimed: boolean | null;
    target_name: string | null;
  }>(
    `SELECT q.id, q.name, q.description, q.required_level,
            q.target_kind, q.target_id, q.target_count,
            q.reward_exp, q.reward_gold, q.reward_item_id, q.reward_item_qty,
            q.reward_item_id2, q.reward_item_qty2, i2.name AS reward_item2_name,
            cq.progress, cq.completed, cq.claimed,
            m.name AS target_name
     FROM quests q
     LEFT JOIN character_quests cq ON cq.quest_id = q.id AND cq.character_id = $1
     LEFT JOIN items i2 ON i2.id = q.reward_item_id2
     LEFT JOIN monsters m ON m.id = q.target_id
     ORDER BY q.required_level ASC, q.id ASC`,
    [id]
  );
  res.json(r.rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    requiredLevel: row.required_level,
    targetName: row.target_name,
    targetCount: row.target_count,
    rewardExp: row.reward_exp,
    rewardGold: row.reward_gold,
    rewardItemId: row.reward_item_id,
    rewardItemQty: row.reward_item_qty,
    rewardItem2Name: row.reward_item2_name,
    rewardItem2Qty: row.reward_item_qty2,
    accepted: row.progress !== null,
    progress: row.progress ?? 0,
    completed: row.completed ?? false,
    claimed: row.claimed ?? false,
    locked: char.level < row.required_level,
  })));
});

// 퀘스트 수락
router.post('/:id/quests/:questId/accept', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const questId = Number(req.params.questId);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const q = await query<{ required_level: number }>('SELECT required_level FROM quests WHERE id = $1', [questId]);
  if (q.rowCount === 0) return res.status(404).json({ error: 'quest not found' });
  if (char.level < q.rows[0].required_level) return res.status(400).json({ error: 'level too low' });

  await query(
    `INSERT INTO character_quests (character_id, quest_id) VALUES ($1, $2)
     ON CONFLICT (character_id, quest_id) DO NOTHING`,
    [id, questId]
  );
  res.json({ ok: true });
});

// 보상 수령
router.post('/:id/quests/:questId/claim', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const questId = Number(req.params.questId);
  const char = await loadCharacterOwned(id, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const cq = await query<{ completed: boolean; claimed: boolean }>(
    'SELECT completed, claimed FROM character_quests WHERE character_id = $1 AND quest_id = $2',
    [id, questId]
  );
  if (cq.rowCount === 0) return res.status(400).json({ error: 'not accepted' });
  if (!cq.rows[0].completed) return res.status(400).json({ error: 'not completed' });
  if (cq.rows[0].claimed) return res.status(400).json({ error: 'already claimed' });

  // 랜덤 박스 보상 (일반70%/희귀20%/영웅8%/전설2%)
  const gradeRoll = Math.random() * 100;
  let boxGrade: string;
  if (gradeRoll < 2) boxGrade = 'legendary';
  else if (gradeRoll < 10) boxGrade = 'epic';
  else if (gradeRoll < 30) boxGrade = 'rare';
  else boxGrade = 'common';

  const boxItems = await query<{ id: number; name: string; grade: string }>(
    `SELECT id, name, grade FROM items WHERE grade = $1 AND type != 'material' ORDER BY RANDOM() LIMIT 1`,
    [boxGrade]
  );

  let rewardItemName = '(없음)';
  let rewardGrade = boxGrade;
  if (boxItems.rows[0]) {
    const item = boxItems.rows[0];
    rewardItemName = item.name;
    rewardGrade = item.grade;
    const { overflow } = await addItemToInventory(id, item.id, 1);
    if (overflow > 0) {
      await deliverToMailbox(id, '퀘스트 보상', `랜덤 박스: ${item.name} — 가방 초과로 우편 발송`, item.id, 1);
    }
  }

  // 추가 보상 (찢어진 스크롤 등)
  const q2 = await query<{ reward_item_id2: number | null; reward_item_qty2: number | null }>(
    'SELECT reward_item_id2, reward_item_qty2 FROM quests WHERE id = $1', [questId]
  );
  if (q2.rows[0]?.reward_item_id2 && q2.rows[0]?.reward_item_qty2) {
    const { overflow: ov2 } = await addItemToInventory(id, q2.rows[0].reward_item_id2, q2.rows[0].reward_item_qty2);
    if (ov2 > 0) {
      await deliverToMailbox(id, '퀘스트 추가 보상', '가방 초과로 우편 발송', q2.rows[0].reward_item_id2, ov2);
    }
  }

  await query(
    'UPDATE character_quests SET claimed = TRUE WHERE character_id = $1 AND quest_id = $2',
    [id, questId]
  );

  res.json({ ok: true, rewardItem: rewardItemName, rewardGrade });
});

// 몬스터 처치 시 퀘스트 진행 (내부용)
export async function trackMonsterKill(characterId: number, monsterId: number) {
  const r = await query<{ quest_id: number; progress: number; target_count: number }>(
    `SELECT cq.quest_id, cq.progress, q.target_count
     FROM character_quests cq JOIN quests q ON q.id = cq.quest_id
     WHERE cq.character_id = $1 AND q.target_kind = 'monster' AND q.target_id = $2
       AND cq.completed = FALSE`,
    [characterId, monsterId]
  );
  for (const row of r.rows) {
    const newProgress = row.progress + 1;
    const done = newProgress >= row.target_count;
    await query(
      'UPDATE character_quests SET progress = $1, completed = $2 WHERE character_id = $3 AND quest_id = $4',
      [Math.min(newProgress, row.target_count), done, characterId, row.quest_id]
    );
  }
}

export default router;
