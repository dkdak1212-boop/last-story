import type { Response, NextFunction } from 'express';
import { query } from '../db/pool.js';
import type { AuthedRequest } from './auth.js';

export async function adminRequired(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.userId) return res.status(401).json({ error: 'unauthorized' });
  const r = await query<{ is_admin: boolean }>('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
  if (r.rowCount === 0 || !r.rows[0].is_admin) return res.status(403).json({ error: 'admin only' });
  next();
}
