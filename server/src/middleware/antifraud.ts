// 다계정/부정거래 방지 헬퍼 — 공용 로직 (mailbox/marketplace에서 사용)
import type { Request } from 'express';
import { query } from '../db/pool.js';

const MIN_TRADE_LEVEL = 30;
const NEW_ACCOUNT_DAYS = 7;
const DAILY_GOLD_SEND_CAP = 100_000_000; // 1억/일

export function getClientIp(req: Request): string {
  const xff = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
  return xff || req.ip || req.socket?.remoteAddress || 'unknown';
}

// 해당 user_id의 가장 최근 로그인 IP (지난 30일 이내)
export async function getLatestUserIp(userId: number): Promise<string | null> {
  const r = await query<{ ip: string | null }>(
    `SELECT ip FROM user_login_log
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.ip || null;
}

// 캐릭터 id → 소유 user_id의 최근 로그인 IP
export async function getLatestCharacterOwnerIp(characterId: number): Promise<string | null> {
  const r = await query<{ ip: string | null }>(
    `SELECT l.ip FROM user_login_log l
     JOIN characters c ON c.user_id = l.user_id
     WHERE c.id = $1 AND l.created_at > NOW() - INTERVAL '30 days'
     ORDER BY l.created_at DESC LIMIT 1`,
    [characterId]
  );
  return r.rows[0]?.ip || null;
}

// 두 IP가 거래 차단 대상인가 (같은 IP면 true, 둘 다 unknown이면 false)
export function sameIpBlocked(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a === 'unknown' || b === 'unknown') return false;
  return a === b;
}

// 계정 생성 이후 경과일
export async function getAccountAgeDays(userId: number): Promise<number> {
  const r = await query<{ age_days: string }>(
    `SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400 AS age_days
     FROM users WHERE id = $1`,
    [userId]
  );
  if (r.rowCount === 0) return 0;
  return Number(r.rows[0].age_days) || 0;
}

// 오늘(UTC 기준 0시 이후) 해당 캐릭터가 발신한 골드 합
export async function getTodayGoldSent(senderCharacterId: number): Promise<number> {
  const r = await query<{ total: string | null }>(
    `SELECT COALESCE(SUM(gold), 0)::text AS total FROM mailbox
     WHERE sender_character_id = $1
       AND created_at >= date_trunc('day', NOW())
       AND gold > 0`,
    [senderCharacterId]
  );
  return Number(r.rows[0]?.total || 0);
}

export const ANTIFRAUD_CONST = {
  MIN_TRADE_LEVEL,
  NEW_ACCOUNT_DAYS,
  DAILY_GOLD_SEND_CAP,
};
