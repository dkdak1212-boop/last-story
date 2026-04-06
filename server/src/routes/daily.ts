import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { addItemToInventory, deliverToMailbox } from '../game/inventory.js';

const router = Router();
router.use(authRequired);

interface RandomBoxReward { type: 'gold' | 'item'; gold?: number; itemId?: number; qty?: number; label: string }

const DAILY_BOX: RandomBoxReward[] = [
  { type: 'gold', gold: 200,  label: '200 골드' },
  { type: 'gold', gold: 500,  label: '500 골드' },
  { type: 'gold', gold: 1000, label: '1,000 골드' },
  { type: 'item', itemId: 100, qty: 3, label: '작은 체력 물약 ×3' },
  { type: 'item', itemId: 101, qty: 3, label: '작은 마나 물약 ×3' },
  { type: 'item', itemId: 102, qty: 2, label: '중급 체력 물약 ×2' },
  { type: 'item', itemId: 103, qty: 2, label: '중급 마나 물약 ×2' },
];

interface WeeklyReward { gold: number; items: { itemId: number; qty: number; label: string }[] }

const WEEKLY_REWARD: WeeklyReward = {
  gold: 10000,
  items: [
    { itemId: 104, qty: 5, label: '고급 체력 물약 ×5' },
    { itemId: 105, qty: 5, label: '고급 마나 물약 ×5' },
    { itemId: 106, qty: 2, label: '최상급 체력 물약 ×2' },
  ],
};

// 상태 조회
router.get('/status', async (req: AuthedRequest, res: Response) => {
  const u = await query<{ last_check_in: string | null; consecutive_days: number }>(
    `SELECT last_check_in, consecutive_days FROM users WHERE id = $1`,
    [req.userId]
  );
  const row = u.rows[0];
  const today = new Date().toISOString().slice(0, 10);
  const last = row.last_check_in ? new Date(row.last_check_in).toISOString().slice(0, 10) : null;
  const canCheckIn = last !== today;
  // 다음 연속 일수 예측
  let nextConsecutive = row.consecutive_days;
  if (canCheckIn) {
    if (last === null) nextConsecutive = 1;
    else {
      const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      nextConsecutive = last === y ? row.consecutive_days + 1 : 1;
    }
  }
  const nextIs7 = nextConsecutive % 7 === 0 && nextConsecutive > 0;
  res.json({
    canCheckIn,
    currentStreak: row.consecutive_days,
    nextStreak: nextConsecutive,
    nextIsWeekly: nextIs7,
  });
});

// 체크인
router.post('/check-in', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ characterId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const char = await loadCharacterOwned(parsed.data.characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const u = await query<{ last_check_in: string | null; consecutive_days: number }>(
    `SELECT last_check_in, consecutive_days FROM users WHERE id = $1`,
    [req.userId]
  );
  const row = u.rows[0];
  const today = new Date().toISOString().slice(0, 10);
  const last = row.last_check_in ? new Date(row.last_check_in).toISOString().slice(0, 10) : null;
  if (last === today) return res.status(400).json({ error: '오늘 이미 체크인 완료' });

  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newConsec = (last === y) ? row.consecutive_days + 1 : 1;

  // 보상 지급
  const isWeekly = newConsec % 7 === 0;
  let rewards: { gold: number; items: { itemId: number; qty: number; label: string }[] } = { gold: 0, items: [] };
  if (isWeekly) {
    rewards = { gold: WEEKLY_REWARD.gold, items: [...WEEKLY_REWARD.items] };
  } else {
    const pick = DAILY_BOX[Math.floor(Math.random() * DAILY_BOX.length)];
    if (pick.type === 'gold') rewards.gold = pick.gold!;
    else rewards.items.push({ itemId: pick.itemId!, qty: pick.qty!, label: pick.label });
  }

  // 적용
  if (rewards.gold > 0) {
    await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [rewards.gold, char.id]);
  }
  for (const it of rewards.items) {
    const { overflow } = await addItemToInventory(char.id, it.itemId, it.qty);
    if (overflow > 0) {
      await deliverToMailbox(char.id, '출석 보상 초과분', '가방이 가득 차서 우편으로 배송', it.itemId, overflow);
    }
  }

  // 유저 업데이트
  await query(
    `UPDATE users SET last_check_in = CURRENT_DATE, consecutive_days = $1 WHERE id = $2`,
    [newConsec, req.userId]
  );

  res.json({
    ok: true,
    isWeekly,
    newStreak: newConsec,
    rewards: {
      gold: rewards.gold,
      items: rewards.items.map(i => i.label),
    },
  });
});

export default router;
