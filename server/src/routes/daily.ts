import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';
import { addItemToInventory, deliverToMailbox } from '../game/inventory.js';

const router = Router();
router.use(authRequired);

// 출석 보상 테이블 (7일 주기)
// 1~6일차: 골드 보상, 7일차: 강화 성공률 스크롤 (id 286)
const ENHANCE_SCROLL_ID = 286;

interface DayReward { gold: number; items: { itemId: number; qty: number; label: string }[]; label: string }

function getDayReward(streakDay: number): DayReward {
  // streakDay: 1~7 (연속 일수 % 7, 0이면 7)
  const d = streakDay === 0 ? 7 : streakDay;
  switch (d) {
    case 1: return { gold: 10000, items: [], label: '1일차 · 10,000G' };
    case 2: return { gold: 20000, items: [], label: '2일차 · 20,000G' };
    case 3: return { gold: 30000, items: [], label: '3일차 · 30,000G' };
    case 4: return { gold: 40000, items: [], label: '4일차 · 40,000G' };
    case 5: return { gold: 50000, items: [], label: '5일차 · 50,000G' };
    case 6: return { gold: 60000, items: [], label: '6일차 · 60,000G' };
    case 7: return {
      gold: 0,
      items: [{ itemId: ENHANCE_SCROLL_ID, qty: 1, label: '강화 성공률 스크롤' }],
      label: '7일차 · 강화 성공률 스크롤',
    };
    default: return { gold: 10000, items: [], label: '10,000G' };
  }
}

// 상태 조회
router.get('/status', async (req: AuthedRequest, res: Response) => {
  const u = await query<{ last_check_in: string | null; consecutive_days: number }>(
    `SELECT last_check_in, consecutive_days FROM users WHERE id = $1`,
    [req.userId]
  );
  const row = u.rows[0];
  if (!row) return res.status(404).json({ error: 'user not found' });
  const consecutive = row.consecutive_days ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const last = row.last_check_in ? new Date(row.last_check_in).toISOString().slice(0, 10) : null;
  const canCheckIn = last !== today;
  // 다음 연속 일수 예측
  let nextConsecutive = consecutive;
  if (canCheckIn) {
    if (last === null) nextConsecutive = 1;
    else {
      const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      nextConsecutive = last === y ? consecutive + 1 : 1;
    }
  }
  const nextIs7 = nextConsecutive % 7 === 0 && nextConsecutive > 0;
  const nextReward = getDayReward(nextConsecutive % 7);
  // 7일 전체 보상 미리보기
  const weekPreview = [1, 2, 3, 4, 5, 6, 7].map(d => {
    const r = getDayReward(d);
    return { day: d, label: r.label, gold: r.gold, items: r.items.map(i => `${i.label}×${i.qty}`) };
  });
  res.json({
    canCheckIn,
    currentStreak: consecutive,
    nextStreak: nextConsecutive,
    nextIsWeekly: nextIs7,
    nextReward: { gold: nextReward.gold, items: nextReward.items.map(i => `${i.label}×${i.qty}`), label: nextReward.label },
    weekPreview,
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
  if (!row) return res.status(404).json({ error: 'user not found' });
  const consecutive = row.consecutive_days ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const last = row.last_check_in ? new Date(row.last_check_in).toISOString().slice(0, 10) : null;
  if (last === today) return res.status(400).json({ error: '오늘 이미 체크인 완료' });

  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newConsec = (last === y) ? consecutive + 1 : 1;

  // 보상 지급 — 7일 주기로 순환
  const dayInCycle = newConsec % 7; // 1~6 + 0(=7일차)
  const isWeekly = dayInCycle === 0;
  const reward = getDayReward(dayInCycle);
  const rewards = { gold: reward.gold, items: [...reward.items] };

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
