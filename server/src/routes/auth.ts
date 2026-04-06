import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';

const router = Router();

const credSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(4).max(64),
});

router.post('/register', async (req, res) => {
  const parsed = credSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const { username, password } = parsed.data;
  const exists = await query('SELECT id FROM users WHERE username = $1', [username]);
  if (exists.rowCount && exists.rowCount > 0) {
    return res.status(409).json({ error: 'username taken' });
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await query<{ id: number }>(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id',
    [username, hash]
  );
  const userId = result.rows[0].id;
  const token = signToken(userId, username);
  res.json({ token });
});

router.post('/login', async (req, res) => {
  const parsed = credSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const { username, password } = parsed.data;
  const result = await query<{ id: number; password_hash: string }>(
    'SELECT id, password_hash FROM users WHERE username = $1',
    [username]
  );
  if (result.rowCount === 0) return res.status(401).json({ error: 'invalid credentials' });

  const ok = await bcrypt.compare(password, result.rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  const token = signToken(result.rows[0].id, username);
  res.json({ token });
});

export default router;
