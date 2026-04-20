import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { query } from '../db/pool.js';

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

export interface AuthedRequest extends Request {
  userId?: number;
  username?: string;
}

export function signToken(userId: number, username: string): string {
  return jwt.sign({ userId, username }, SECRET, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'],
  });
}

// ─────────────────────────────────────────────────────────────────────────
// JWT 무효화 검증 (계정 truncate 후 user_id 재사용 대응 + 전체 로그아웃)
//
// 두 가지 거부 조건:
//  1) payload.iat < server_config.min_jwt_iat  → 전체 로그아웃 발동 시점 이전 토큰
//  2) payload.iat < users.created_at_epoch     → 현 user_id 주인이 바뀜 (ID 재사용)
// ─────────────────────────────────────────────────────────────────────────

const userCreatedAtCache = new Map<number, number>(); // userId → unix seconds (永)
let minIatCache: { value: number; fetchedAt: number } = { value: 0, fetchedAt: 0 };
const MIN_IAT_TTL_MS = 60_000;

export function invalidateUserCreatedAtCache(userId: number) {
  userCreatedAtCache.delete(userId);
}
export function invalidateMinIatCache() {
  minIatCache = { value: 0, fetchedAt: 0 };
}

async function getMinIat(): Promise<number> {
  const now = Date.now();
  if (now - minIatCache.fetchedAt < MIN_IAT_TTL_MS) return minIatCache.value;
  try {
    const r = await query<{ value: string }>(
      `SELECT value FROM server_config WHERE key = 'min_jwt_iat'`
    );
    const v = r.rows[0]?.value ? Number(r.rows[0].value) : 0;
    minIatCache = { value: Number.isFinite(v) ? v : 0, fetchedAt: now };
    return minIatCache.value;
  } catch {
    return minIatCache.value; // DB 장애 시 기존 값 유지
  }
}

async function getUserCreatedAtEpoch(userId: number): Promise<number | null> {
  const cached = userCreatedAtCache.get(userId);
  if (cached !== undefined) return cached;
  try {
    const r = await query<{ created_at: Date }>(
      'SELECT created_at FROM users WHERE id = $1', [userId]
    );
    if (r.rowCount === 0) return null;
    const v = Math.floor(new Date(r.rows[0].created_at).getTime() / 1000);
    userCreatedAtCache.set(userId, v);
    return v;
  } catch {
    return null;
  }
}

async function verifyJwtFresh(token: string): Promise<{ userId: number; username: string } | null> {
  let payload: { userId: number; username: string; iat?: number };
  try {
    payload = jwt.verify(token, SECRET) as { userId: number; username: string; iat?: number };
  } catch {
    return null;
  }
  const iat = payload.iat ?? 0;
  const minIat = await getMinIat();
  if (minIat > 0 && iat < minIat) return null; // 전체 로그아웃 이전 토큰
  const userCreated = await getUserCreatedAtEpoch(payload.userId);
  if (userCreated === null) return null; // 유저 삭제됨
  // 1초 여유 — DB created_at 와 JWT iat 간 반올림 차이 허용
  if (iat + 1 < userCreated) return null; // user_id 재사용된 토큰
  return { userId: payload.userId, username: payload.username };
}

export async function authRequired(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const result = await verifyJwtFresh(header.slice(7));
  if (!result) return res.status(401).json({ error: 'invalid token' });
  req.userId = result.userId;
  req.username = result.username;
  next();
}

// 토큰 있으면 식별, 없거나 유효하지 않아도 통과 (다음 미들웨어에서 판단)
export async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const result = await verifyJwtFresh(header.slice(7));
    if (result) {
      req.userId = result.userId;
      req.username = result.username;
    }
  }
  next();
}

// WS 등 미들웨어 외부에서 사용
export { verifyJwtFresh };
