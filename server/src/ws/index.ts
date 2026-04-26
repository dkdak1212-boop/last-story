import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { query } from '../db/pool.js';
import { toggleAutoMode, manualSkillUse } from '../combat/engine.js';
import { verifyJwtFresh } from '../middleware/auth.js';

// 동일 IP 2계정 동시 접속 차단 — ip → 접속 중인 userId set
// 관리자(isAdmin)는 집계 제외
const ipToUserIds = new Map<string, Set<number>>();

// userId → is_admin / chat_hidden 캐시 (WS 재연결 폭주 시 DB 쿼리 감소)
const adminCache = new Map<number, { isAdmin: boolean; chatHidden: boolean; exp: number }>();
const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000;
export function invalidateAdminCache(userId: number) {
  adminCache.delete(userId);
}
// 만료 entry 정기 청소 (10분마다) — 장기 운영 시 Map 누수 방지
setInterval(() => {
  const now = Date.now();
  for (const [userId, v] of adminCache) {
    if (v.exp <= now) adminCache.delete(userId);
  }
}, 10 * 60 * 1000);

export function initWebSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN || '*' },
    // Egress 절감: WS 메시지 압축 (60~80% 감소 예상)
    perMessageDeflate: {
      threshold: 1024, // 1KB 이상 메시지만 압축 (작은 건 오버헤드)
    },
  });

  io.use(async (socket, next) => {
    // WS 연결 rate limit (IP 분당 5회) — SYN flood 등 차단
    const { checkWsConnectionRate } = await import('../middleware/security.js');
    const xff = (socket.handshake.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
    const ip = xff || socket.handshake.address || 'unknown';
    if (!checkWsConnectionRate(ip)) {
      return next(new Error('too many connections'));
    }
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('no token'));
    const verified = await verifyJwtFresh(token);
    if (!verified) return next(new Error('invalid token'));
    try {
      socket.data.userId = verified.userId;
      socket.data.username = verified.username;
      socket.data.ip = ip;
      // is_admin / chat_hidden — 5분 메모리 캐시로 재연결 시 DB 쿼리 스킵
      const now = Date.now();
      const cached = adminCache.get(verified.userId);
      if (cached && cached.exp > now) {
        socket.data.isAdmin = cached.isAdmin;
        socket.data.chatHidden = cached.chatHidden;
      } else {
        try {
          const r = await query<{ is_admin: boolean; chat_hidden: boolean }>(
            'SELECT is_admin, COALESCE(chat_hidden, FALSE) AS chat_hidden FROM users WHERE id = $1',
            [verified.userId]
          );
          const isAdmin = r.rows[0]?.is_admin ?? false;
          const chatHidden = r.rows[0]?.chat_hidden ?? false;
          socket.data.isAdmin = isAdmin;
          socket.data.chatHidden = chatHidden;
          adminCache.set(verified.userId, { isAdmin, chatHidden, exp: now + ADMIN_CACHE_TTL_MS });
        } catch {
          socket.data.isAdmin = false;
          socket.data.chatHidden = false;
        }
      }
      // 유지보수 모드 — 어드민 외 WS 접속 차단
      if (!socket.data.isAdmin) {
        const { getServerStatus } = await import('../middleware/maintenance.js');
        const status = await getServerStatus();
        if (status.maintenance) {
          return next(new Error('서버 점검 중입니다. 잠시 후 다시 접속해주세요.'));
        }
      }
      // 동일 IP 2계정 동시 접속 차단 (관리자 제외, unknown IP 제외)
      if (!socket.data.isAdmin && ip && ip !== 'unknown') {
        const set = ipToUserIds.get(ip);
        if (set && set.size > 0 && !set.has(verified.userId)) {
          return next(new Error('동일 IP에서 다른 계정이 이미 접속 중입니다. 기존 접속을 먼저 종료해주세요.'));
        }
      }
      next();
    } catch {
      next(new Error('invalid token'));
    }
  });

  function broadcastOnlineCountNow() {
    const userIds = new Set<number>();
    for (const [, s] of io.sockets.sockets) {
      if (s.data.isAdmin) continue;
      if (s.data.userId) userIds.add(s.data.userId);
    }
    io.emit('online-count', userIds.size);
  }

  // WS 재연결 폭주 시 broadcast 폭주 방지 — 최대 초당 1회
  const BROADCAST_THROTTLE_MS = 1000;
  let broadcastTimer: NodeJS.Timeout | null = null;
  let broadcastPending = false;
  function broadcastOnlineCount() {
    if (broadcastTimer) {
      broadcastPending = true;
      return;
    }
    broadcastOnlineCountNow();
    broadcastTimer = setTimeout(() => {
      broadcastTimer = null;
      if (broadcastPending) {
        broadcastPending = false;
        broadcastOnlineCount();
      }
    }, BROADCAST_THROTTLE_MS);
  }

  io.on('connection', (socket) => {
    // 연결/해제 로그는 Railway 로그 한도(500/sec) 초과 원인 — DEBUG_WS=1 일 때만 출력
    if (process.env.DEBUG_WS === '1') console.log(`[ws] connected: ${socket.data.username}`);
    broadcastOnlineCount();

    // IP → userId 집계 (관리자 제외)
    if (!socket.data.isAdmin && socket.data.ip && socket.data.ip !== 'unknown') {
      const ip = socket.data.ip as string;
      if (!ipToUserIds.has(ip)) ipToUserIds.set(ip, new Set());
      ipToUserIds.get(ip)!.add(socket.data.userId);
    }

    // 전투 채널 구독 — 세션 없으면 자동 복원 (배포 후 재접속 시 세션 휘발 복구).
    // 단, 오프라인 모드(last_offline_at != NULL) 인 캐릭은 자동 시작 안 함 — 사용자가
    // "오프라인 사냥 중단" 버튼으로 명시 정산해야 사냥 재개.
    //
    // [한 캐릭 동시 접속 차단] 같은 characterId 로 다른 소켓이 이미 subscribe 중이면
    // 이전 소켓들을 강제 disconnect ("최후 접속 우선" 정책). 여러 브라우저/탭으로
    // 같은 캐릭 동시 접속해 사냥 중복하는 어뷰즈 차단. 자기 자신(같은 socket id)
    // 은 제외. 같은 user 가 다른 캐릭(부캐) 으로 subscribe 하는 건 정상이므로
    // characterId 가 동일할 때만 disconnect.
    socket.on('combat:subscribe', async (characterId: number) => {
      // 같은 캐릭으로 subscribe 한 다른 소켓 정리
      for (const [, other] of io.sockets.sockets) {
        if (other.id === socket.id) continue;
        if (other.data.subscribedCharId === characterId) {
          try {
            other.emit('session:kicked', {
              reason: '같은 캐릭터로 다른 곳에서 접속하여 이 세션이 종료되었습니다.',
            });
          } catch {}
          other.disconnect(true);
        }
      }
      socket.data.subscribedCharId = characterId;
      socket.join(`combat:${characterId}`);

      try {
        const { activeSessions, startCombatSession, startGuildBossCombatSession } = await import('../combat/engine.js');
        if (activeSessions.has(characterId)) return;
        const r = await query<{ user_id: number; location: string; last_offline_at: string | null }>(
          'SELECT user_id, location, last_offline_at FROM characters WHERE id = $1', [characterId]
        );
        const row = r.rows[0];
        if (!row || row.user_id !== socket.data.userId) return;
        if (row.last_offline_at) return; // 오프라인 모드 — 자동 세션 시작 차단
        if (row.location && row.location.startsWith('field:')) {
          const fid = parseInt(row.location.slice(6), 10);
          if (!Number.isNaN(fid) && fid > 0) {
            // 길드보스 진행 중 (location='field:999') 이면 일반 세션 X — active run 복원.
            // 백그라운드 후 재접속 시 "적을 찾는 중" 표시 무한 차단.
            if (fid === 999) {
              const runR = await query<{ id: string; boss_id: number }>(
                `SELECT id::text, boss_id FROM guild_boss_runs
                  WHERE character_id = $1 AND ended_at IS NULL
                  ORDER BY started_at DESC LIMIT 1`,
                [characterId]
              );
              if (runR.rowCount) {
                const { getBossById } = await import('../combat/guildBossHelpers.js');
                const boss = await getBossById(runR.rows[0].boss_id);
                if (boss) {
                  await startGuildBossCombatSession(characterId, runR.rows[0].id, boss);
                }
              }
            } else {
              await startCombatSession(characterId, fid);
            }
          }
        }
      } catch (e) {
        console.error('[ws] combat:subscribe restore err', e);
      }
    });

    socket.on('combat:unsubscribe', (characterId: number) => {
      socket.leave(`combat:${characterId}`);
      if (socket.data.subscribedCharId === characterId) {
        socket.data.subscribedCharId = undefined;
      }
    });

    // 전투 자동/수동 토글
    socket.on('combat:toggle-auto', (characterId: number) => {
      const autoMode = toggleAutoMode(characterId);
      socket.emit('combat:auto-mode', { characterId, autoMode });
    });

    // 전투 수동 스킬 사용
    socket.on('combat:use-skill', async (data: { characterId: number; skillId: number }) => {
      await manualSkillUse(data.characterId, data.skillId);
    });

    // 채팅 — flood 방지 (초당 1개, 분당 20개)
    socket.on('chat', async (payload: { channel: string; text: string; characterId?: number }) => {
      if (!payload?.text || payload.text.length > 200) return;
      if (socket.data.userId) {
        const { checkChatRate } = await import('../middleware/security.js');
        const rate = checkChatRate(socket.data.userId);
        if (!rate.ok) {
          socket.emit('chat:error', { message: rate.reason });
          return;
        }
      }
      const channel = ['global', 'trade', 'guild'].includes(payload.channel) ? payload.channel : 'global';
      const text = payload.text.trim();
      if (!text) return;

      // 캐릭터명 조회
      let displayName = socket.data.username;
      let nickHighlight = false;
      if (payload.characterId) {
        const cr = await query<{ name: string; nick_highlight: boolean }>(
          'SELECT name, COALESCE(nick_highlight, FALSE) AS nick_highlight FROM characters WHERE id = $1 AND user_id = $2',
          [payload.characterId, socket.data.userId]
        );
        if (cr.rows[0]) { displayName = cr.rows[0].name; nickHighlight = cr.rows[0].nick_highlight; }
      }

      let scopeId: number | null = null;
      if (channel === 'guild') {
        if (!payload.characterId) {
          socket.emit('chat:error', { message: '캐릭터를 선택하세요.' });
          return;
        }
        const gr = await query<{ guild_id: number }>(
          'SELECT guild_id FROM guild_members WHERE character_id = $1', [payload.characterId]
        );
        if (gr.rowCount === 0) {
          socket.emit('chat:error', { message: '길드에 가입되어 있지 않습니다.' });
          return;
        }
        scopeId = gr.rows[0].guild_id;
      }

      // chat_hidden 유저: 저장도 브로드캐스트도 안 함 (운영 차단 — 본인에겐 일반 실패로 표시)
      if (socket.data.chatHidden) {
        socket.emit('chat:error', { message: '메시지 전송에 실패했습니다.' });
        return;
      }

      try {
        const isAdmin = !!socket.data.isAdmin;
        const chatName = isAdmin ? '운영자' : displayName;
        const r = await query<{ id: number; created_at: string }>(
          `INSERT INTO chat_messages (channel, from_name, text, scope_id)
           VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
          [channel, chatName, text, scopeId]
        );
        io.emit('chat', {
          id: r.rows[0].id,
          channel, scopeId,
          from: chatName,
          text,
          isAdmin,
          nickHighlight: isAdmin ? false : nickHighlight,
          createdAt: r.rows[0].created_at,
        });
      } catch (e) {
        console.error('[chat] save error', e);
      }
    });

    socket.on('disconnect', () => {
      if (process.env.DEBUG_WS === '1') console.log(`[ws] disconnected: ${socket.data.username}`);
      broadcastOnlineCount();

      // IP → userId 집계 정리: 같은 userId의 다른 소켓이 없을 때만 제거
      if (!socket.data.isAdmin && socket.data.ip && socket.data.ip !== 'unknown') {
        const ip = socket.data.ip as string;
        const myUserId = socket.data.userId as number;
        let stillOnline = false;
        for (const [, s] of io.sockets.sockets) {
          if (s.id !== socket.id && s.data.userId === myUserId && s.data.ip === ip) {
            stillOnline = true;
            break;
          }
        }
        if (!stillOnline) {
          const set = ipToUserIds.get(ip);
          if (set) {
            set.delete(myUserId);
            if (set.size === 0) ipToUserIds.delete(ip);
          }
        }
      }
    });
  });

  // ipToUserIds 좀비 entry 정리 (5분마다) — disconnect 누락·예외 대비
  setInterval(() => {
    const liveUserIds = new Set<number>();
    for (const [, sock] of io.sockets.sockets) {
      if (sock.data?.userId) liveUserIds.add(sock.data.userId);
    }
    for (const [ip, set] of ipToUserIds) {
      for (const uid of set) {
        if (!liveUserIds.has(uid)) set.delete(uid);
      }
      if (set.size === 0) ipToUserIds.delete(ip);
    }
  }, 5 * 60 * 1000);

  // combat engine에서 emit할 때 room 기반으로 보내도록 오버라이드
  const origEmit = io.emit.bind(io);
  io.emit = ((event: string, ...args: any[]) => {
    if (event.startsWith('combat:')) {
      return io.to(event).emit(event, ...args);
    }
    return origEmit(event, ...args);
  }) as any;

  return io;
}
