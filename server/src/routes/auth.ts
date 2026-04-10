import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { sendMail } from '../lib/mailer.js';

const router = Router();

const credSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(4).max(64),
});

const registerSchema = credSchema.extend({
  email: z.string().email().max(100),
});

function getClientIp(req: any): string {
  // x-forwarded-for 우선 (Railway 등 프록시 뒤)
  const xff = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
  return xff || req.ip || req.socket?.remoteAddress || 'unknown';
}

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input (email required)' });

  const { username, password, email } = parsed.data;
  const ip = getClientIp(req);

  // IP 당 1계정 제한
  const ipExists = await query('SELECT id, username FROM users WHERE registered_ip = $1', [ip]);
  if (ipExists.rowCount && ipExists.rowCount > 0) {
    return res.status(409).json({ error: '이 IP에서 이미 가입된 계정이 있습니다' });
  }

  const exists = await query('SELECT id FROM users WHERE username = $1', [username]);
  if (exists.rowCount && exists.rowCount > 0) {
    return res.status(409).json({ error: 'username taken' });
  }
  const emailExists = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (emailExists.rowCount && emailExists.rowCount > 0) {
    return res.status(409).json({ error: 'email already registered' });
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await query<{ id: number }>(
    'INSERT INTO users (username, password_hash, email, registered_ip, max_character_slots) VALUES ($1, $2, $3, $4, 2) RETURNING id',
    [username, hash, email, ip]
  );
  const userId = result.rows[0].id;
  const token = signToken(userId, username);
  res.json({ token });
});

router.post('/login', async (req, res) => {
  const parsed = credSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  const { username, password } = parsed.data;
  const result = await query<{ id: number; password_hash: string; banned: boolean; ban_reason: string | null }>(
    'SELECT id, password_hash, banned, ban_reason FROM users WHERE username = $1',
    [username]
  );
  if (result.rowCount === 0) return res.status(401).json({ error: 'invalid credentials' });

  const user = result.rows[0];
  if (user.banned) return res.status(403).json({ error: user.ban_reason ? `계정 정지: ${user.ban_reason}` : '계정이 정지되었습니다.' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  const token = signToken(user.id, username);
  res.json({ token });
});

// 비밀번호 찾기 — 아이디 + 이메일 일치 시 임시 비밀번호 이메일 발송
const forgotSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email().max(100),
});

router.post('/forgot-password', async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '입력값 확인' });
  const { username, email } = parsed.data;

  const r = await query<{ id: number; email: string | null }>(
    'SELECT id, email FROM users WHERE username = $1',
    [username]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: '일치하는 계정 없음' });
  if (!r.rows[0].email || r.rows[0].email.toLowerCase() !== email.toLowerCase()) {
    return res.status(400).json({ error: '이메일이 일치하지 않습니다' });
  }

  // 임시 비밀번호 12자리 생성
  const tempPassword = crypto.randomBytes(6).toString('base64url').slice(0, 12);
  const hash = await bcrypt.hash(tempPassword, 10);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, r.rows[0].id]);

  // 이메일 발송
  const subject = '[마지막이야기] 임시 비밀번호 안내';
  const text = `안녕하세요, 마지막이야기입니다.

요청하신 임시 비밀번호는 아래와 같습니다.

임시 비밀번호: ${tempPassword}

보안을 위해 로그인 후 반드시 비밀번호를 변경해 주세요.

— 마지막이야기 운영팀`;

  const sent = await sendMail(r.rows[0].email, subject, text);
  if (!sent) {
    // SMTP 미설정 시 콘솔에만 찍히므로 에러로 응답
    return res.status(500).json({ error: '메일 전송 실패 — 운영자에게 문의하세요' });
  }
  res.json({ ok: true, message: '등록된 이메일로 임시 비밀번호를 보냈습니다.' });
});

export default router;
