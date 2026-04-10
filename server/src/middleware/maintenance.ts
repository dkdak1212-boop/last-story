// 서버 유지보수 모드 미들웨어
// server_config.maintenance_until 이 현재 시각보다 크면 admin 외 모든 요청 차단
import type { Request, Response, NextFunction } from 'express';
import { query } from '../db/pool.js';

// 5초 TTL 캐시 (DB 과부하 방지)
let cached: { until: Date | null; ts: number } = { until: null, ts: 0 };
const TTL = 5000;

async function getMaintenanceUntil(): Promise<Date | null> {
  const now = Date.now();
  if (now - cached.ts < TTL) return cached.until;
  try {
    const r = await query<{ value: string }>(
      `SELECT value FROM server_config WHERE key = 'maintenance_until'`
    );
    cached = {
      until: r.rows[0] ? new Date(r.rows[0].value) : null,
      ts: now,
    };
    return cached.until;
  } catch {
    cached = { until: null, ts: now };
    return null;
  }
}

// 유지보수 중일 때 admin 외 모든 요청을 503으로 차단
export async function maintenanceGate(req: Request, res: Response, next: NextFunction) {
  const until = await getMaintenanceUntil();
  if (!until || until.getTime() <= Date.now()) return next();

  // admin 요청 허용 (로그인 경로는 항상 통과시켜서 admin이 접속 가능)
  // admin 여부는 토큰에서 확인. 토큰 없으면 차단.
  const authed = (req as any).userId;
  if (authed) {
    try {
      const r = await query<{ is_admin: boolean }>('SELECT is_admin FROM users WHERE id = $1', [authed]);
      if (r.rows[0]?.is_admin) return next();
    } catch {}
  }

  // 로그인/상태 조회는 허용 (어드민이 로그인할 수 있어야 함)
  if (req.path === '/auth/login' || req.path.startsWith('/server-status')) return next();

  res.status(503).json({
    error: 'maintenance',
    message: '서버 점검 중입니다',
    until: until.toISOString(),
  });
}

// 클라이언트에서 확인할 수 있는 공개 상태 조회
export async function getServerStatus(): Promise<{ maintenance: boolean; until: string | null }> {
  const until = await getMaintenanceUntil();
  if (!until || until.getTime() <= Date.now()) return { maintenance: false, until: null };
  return { maintenance: true, until: until.toISOString() };
}

// 캐시 수동 무효화
export function invalidateMaintenanceCache() {
  cached = { until: null, ts: 0 };
}
