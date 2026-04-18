import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { sendMail } from '../lib/mailer.js';
import { loginLimiter, registerLimiter, forgotPasswordLimiter, recordLoginFailure, clearLoginFailures } from '../middleware/security.js';

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

// 로그인 로그 기록 (실패해도 로그인은 성공 — 논블로킹)
async function recordLogin(userId: number, req: any, provider: string | null = null): Promise<void> {
  try {
    const ip = getClientIp(req);
    const ua = (req.headers['user-agent'] || '').toString().slice(0, 500);
    await query(
      `INSERT INTO user_login_log (user_id, ip, user_agent, provider) VALUES ($1, $2, $3, $4)`,
      [userId, ip, ua, provider]
    );
  } catch (e) {
    console.error('[login-log] err', e);
  }
}

async function isIpBlocked(ip: string): Promise<{ blocked: boolean; reason?: string }> {
  if (!ip || ip === 'unknown') return { blocked: false };
  try {
    const r = await query<{ reason: string | null }>('SELECT reason FROM blocked_ips WHERE ip = $1', [ip]);
    if (r.rowCount && r.rowCount > 0) return { blocked: true, reason: r.rows[0].reason ?? 'IP 차단' };
  } catch {}
  return { blocked: false };
}

router.post('/register', registerLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    console.warn('[register] zod 실패:', parsed.error.flatten(), 'body:', { ...req.body, password: '***' });
    const err = parsed.error.errors[0];
    let msg = '입력값을 확인해주세요';
    if (err?.path[0] === 'username') msg = '아이디는 영문/숫자/_ 3~20자';
    else if (err?.path[0] === 'password') msg = '비밀번호는 4~64자';
    else if (err?.path[0] === 'email') msg = '올바른 이메일 형식이 아닙니다';
    return res.status(400).json({ error: msg });
  }

  const { username, password, email } = parsed.data;
  const ip = getClientIp(req);

  // IP 차단 체크
  const blk = await isIpBlocked(ip);
  if (blk.blocked) {
    console.warn(`[register] 차단된 IP 시도: ${ip}`);
    return res.status(403).json({ error: `접속 차단됨${blk.reason ? ` (${blk.reason})` : ''}` });
  }

  try {
    const exists = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (exists.rowCount && exists.rowCount > 0) {
      return res.status(409).json({ error: '이미 사용 중인 아이디입니다' });
    }
    const emailExists = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (emailExists.rowCount && emailExists.rowCount > 0) {
      return res.status(409).json({ error: '이미 가입된 이메일입니다' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await query<{ id: number }>(
      'INSERT INTO users (username, password_hash, email, registered_ip, max_character_slots) VALUES ($1, $2, $3, $4, 3) RETURNING id',
      [username, hash, email.toLowerCase(), ip]
    );
    const userId = result.rows[0].id;
    const token = signToken(userId, username);
    console.log(`[register] 성공: ${username} (${email}) ip=${ip}`);
    res.json({ token });
  } catch (e: any) {
    console.error('[register] 서버 에러:', e?.message, e?.detail, 'ip:', ip);
    res.status(500).json({ error: '서버 오류 — 운영자에게 문의해주세요' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = credSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });

  // IP 차단 체크
  const ip = getClientIp(req);
  const blk = await isIpBlocked(ip);
  if (blk.blocked) {
    console.warn(`[login] 차단된 IP 시도: ${ip}`);
    return res.status(403).json({ error: `접속 차단됨${blk.reason ? ` (${blk.reason})` : ''}` });
  }

  const { username, password } = parsed.data;
  const result = await query<{ id: number; password_hash: string; banned: boolean; ban_reason: string | null }>(
    'SELECT id, password_hash, banned, ban_reason FROM users WHERE username = $1',
    [username]
  );
  if (result.rowCount === 0) {
    recordLoginFailure(ip, 'unknown username').catch(() => {});
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const user = result.rows[0];
  if (user.banned) return res.status(403).json({ error: user.ban_reason ? `계정 정지: ${user.ban_reason}` : '계정이 정지되었습니다.' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    recordLoginFailure(ip, 'wrong password').catch(() => {});
    return res.status(401).json({ error: 'invalid credentials' });
  }

  clearLoginFailures(ip);
  const token = signToken(user.id, username);
  recordLogin(user.id, req, 'password').catch(() => {});
  res.json({ token });
});

// 비밀번호 찾기 — 아이디 + 이메일 일치 시 임시 비밀번호 이메일 발송
const forgotSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email().max(100),
});

router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
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

// ============================================================
// Google OAuth 로그인
// env: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI
//      CLIENT_URL (리다이렉트 대상, 없으면 req 호스트 기준)
// ============================================================
function googleRedirectUri(req: any): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const proto = req.protocol === 'http' && req.get('host')?.includes('railway.app') ? 'https' : req.protocol;
  return `${proto}://${req.get('host')}/api/auth/google/callback`;
}

// 임시 진단 — 환경변수 로드 상태 확인 (운영 후 제거)
router.get('/_env-check', (_req, res) => {
  res.json({
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? `SET(len=${process.env.GOOGLE_CLIENT_ID.length})` : 'MISSING',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'MISSING',
    CLIENT_URL: process.env.CLIENT_URL || 'MISSING',
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'MISSING',
    NODE_ENV: process.env.NODE_ENV || 'unset',
  });
});

router.get('/google/start', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).send('Google OAuth 미설정 (GOOGLE_CLIENT_ID)');
  const redirectUri = googleRedirectUri(req);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get('/google/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!code) return res.status(400).send('code 누락');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(500).send('Google OAuth 미설정');

  const redirectUri = googleRedirectUri(req);
  const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;

  try {
    // 1) code → token
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }).toString(),
    });
    if (!tokenResp.ok) {
      console.error('[google-oauth] token fail', await tokenResp.text());
      return res.redirect(`${clientUrl}/?oauth_error=token_exchange`);
    }
    const tokens = await tokenResp.json() as { access_token: string; id_token?: string };

    // 2) userinfo
    const uResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!uResp.ok) {
      console.error('[google-oauth] userinfo fail');
      return res.redirect(`${clientUrl}/?oauth_error=userinfo`);
    }
    const gu = await uResp.json() as { id: string; email?: string; name?: string };

    // 3) 차단 IP 체크
    const ip = getClientIp(req);
    const blk = await isIpBlocked(ip);
    if (blk.blocked) return res.redirect(`${clientUrl}/?oauth_error=blocked`);

    // 4) 기존 유저 조회 / 신규 생성
    const provider = 'google';
    const providerId = gu.id;
    const existR = await query<{ id: number; username: string; banned: boolean; ban_reason: string | null }>(
      'SELECT id, username, banned, ban_reason FROM users WHERE provider = $1 AND provider_id = $2',
      [provider, providerId]
    );
    let userId: number, username: string;
    if (existR.rowCount && existR.rowCount > 0) {
      const u = existR.rows[0];
      if (u.banned) return res.redirect(`${clientUrl}/?oauth_error=banned`);
      userId = u.id;
      username = u.username;
    } else {
      // 고유 username 생성: google_{마지막 8자리}
      const base = `google_${providerId.slice(-8)}`;
      let uname = base, i = 0;
      while (i < 20) {
        const chk = await query('SELECT 1 FROM users WHERE username = $1', [uname]);
        if (!chk.rowCount) break;
        i++;
        uname = `${base}_${i}`;
      }
      const ins = await query<{ id: number }>(
        `INSERT INTO users (username, password_hash, email, registered_ip, max_character_slots, provider, provider_id)
         VALUES ($1, NULL, $2, $3, 3, $4, $5) RETURNING id`,
        [uname, gu.email || null, ip, provider, providerId]
      );
      userId = ins.rows[0].id;
      username = uname;
    }

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId]);
    const token = signToken(userId, username);
    recordLogin(userId, req, 'google').catch(() => {});
    // 클라에 토큰 전달: # 해시로 (서버 로그에 안 남고 history 만 남음)
    res.redirect(`${clientUrl}/#oauth_token=${encodeURIComponent(token)}`);
  } catch (e) {
    console.error('[google-oauth] err', e);
    res.redirect(`${clientUrl}/?oauth_error=unknown`);
  }
});

export default router;
