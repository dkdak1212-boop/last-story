import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

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

export function authRequired(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const payload = jwt.verify(header.slice(7), SECRET) as { userId: number; username: string };
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

// 토큰 있으면 식별, 없거나 유효하지 않아도 통과 (다음 미들웨어에서 판단)
export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), SECRET) as { userId: number; username: string };
      req.userId = payload.userId;
      req.username = payload.username;
    } catch { /* 무시 */ }
  }
  next();
}
