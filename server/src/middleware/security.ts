// 보안 미들웨어 — rate limit + 요청 제한 + IP 차단 헬퍼
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { query } from '../db/pool.js';

function getIp(req: Request): string {
  const xff = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
  return xff || req.ip || req.socket?.remoteAddress || 'unknown';
}

// 로그인 시도 제한 — IP당 15분에 5회
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getIp(req),
  message: { error: '로그인 시도 과다 — 15분 후 재시도' },
  skipSuccessfulRequests: true, // 성공한 로그인은 카운트 안 함
});

// 회원가입 제한 — IP당 1시간에 3회
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getIp(req),
  message: { error: '가입 시도 과다 — 1시간 후 재시도' },
});

// 비밀번호 찾기 제한 — IP당 1시간에 5회
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getIp(req),
  message: { error: '비밀번호 찾기 시도 과다 — 1시간 후 재시도' },
});

// 전역 API 제한 — IP당 분당 300 요청 (읽기는 넉넉, 자동화 봇만 차단)
export const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getIp(req),
  message: { error: 'API 호출 과다 — 잠시 후 재시도' },
  skip: (req) => {
    // 정적 에셋 / 헬스체크는 제외
    if (req.path === '/') return true;
    if (req.path.startsWith('/assets/')) return true;
    if (req.path.startsWith('/images/')) return true;
    if (req.path === '/favicon.ico') return true;
    return false;
  },
});

// fail2ban — 로그인 실패 20회/시간 → IP 자동 차단 24시간
const failTracker = new Map<string, { count: number; first: number }>();
const FAIL_WINDOW_MS = 60 * 60_000; // 1시간
const FAIL_THRESHOLD = 20;
const BAN_DURATION_MS = 24 * 60 * 60_000; // 24시간

export async function recordLoginFailure(ip: string, reason = 'login failure'): Promise<void> {
  if (!ip || ip === 'unknown') return;
  const now = Date.now();
  const entry = failTracker.get(ip);
  if (!entry || now - entry.first > FAIL_WINDOW_MS) {
    failTracker.set(ip, { count: 1, first: now });
    return;
  }
  entry.count += 1;
  if (entry.count >= FAIL_THRESHOLD) {
    // IP 자동 차단 DB 등록
    try {
      await query(
        `INSERT INTO blocked_ips (ip, reason, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '24 hours')
         ON CONFLICT (ip) DO UPDATE SET
           reason = EXCLUDED.reason,
           expires_at = EXCLUDED.expires_at`,
        [ip, `fail2ban: ${FAIL_THRESHOLD}회 ${reason} (1시간 내)`]
      );
      console.warn(`[fail2ban] IP ${ip} 자동 차단 24h (${reason})`);
      failTracker.delete(ip);
    } catch (e) { console.error('[fail2ban] block err', e); }
  }
}

// 로그인 성공 시 실패 카운터 리셋
export function clearLoginFailures(ip: string): void {
  failTracker.delete(ip);
}

// WebSocket 연결 rate limit (분당 N회/IP)
const wsConnTracker = new Map<string, number[]>();
const WS_CONN_WINDOW_MS = 60_000;
const WS_CONN_MAX = 5;

export function checkWsConnectionRate(ip: string): boolean {
  if (!ip || ip === 'unknown') return true;
  const now = Date.now();
  const arr = (wsConnTracker.get(ip) || []).filter(t => now - t < WS_CONN_WINDOW_MS);
  if (arr.length >= WS_CONN_MAX) return false; // reject
  arr.push(now);
  wsConnTracker.set(ip, arr);
  return true;
}

// 채팅 flood 방지 — 초당 1개, 분당 20개
const chatTracker = new Map<number, { lastMsgAt: number; minuteCount: number; minuteStart: number }>();

export function checkChatRate(userId: number): { ok: boolean; reason?: string } {
  const now = Date.now();
  const entry = chatTracker.get(userId) || { lastMsgAt: 0, minuteCount: 0, minuteStart: now };
  // 1초 제한
  if (now - entry.lastMsgAt < 1000) {
    return { ok: false, reason: '채팅은 1초에 한 번만 가능합니다' };
  }
  // 1분 제한
  if (now - entry.minuteStart > 60_000) {
    entry.minuteStart = now;
    entry.minuteCount = 0;
  }
  if (entry.minuteCount >= 20) {
    return { ok: false, reason: '채팅 과다 — 1분 후 재시도' };
  }
  entry.lastMsgAt = now;
  entry.minuteCount += 1;
  chatTracker.set(userId, entry);
  return { ok: true };
}

// 주기적 메모리 정리 (오래된 tracker 항목)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of failTracker) {
    if (now - entry.first > FAIL_WINDOW_MS) failTracker.delete(ip);
  }
  for (const [ip, arr] of wsConnTracker) {
    const fresh = arr.filter(t => now - t < WS_CONN_WINDOW_MS);
    if (fresh.length === 0) wsConnTracker.delete(ip);
    else wsConnTracker.set(ip, fresh);
  }
  for (const [uid, entry] of chatTracker) {
    if (now - entry.lastMsgAt > 120_000) chatTracker.delete(uid);
  }
}, 5 * 60_000);
