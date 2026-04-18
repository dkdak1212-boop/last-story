import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { toggleAutoMode, manualSkillUse } from '../combat/engine.js';

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

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
    try {
      const payload = jwt.verify(token, SECRET) as { userId: number; username: string };
      socket.data.userId = payload.userId;
      socket.data.username = payload.username;
      // is_admin 동기로 가져와야 broadcastOnlineCount가 정확
      try {
        const r = await query<{ is_admin: boolean; chat_hidden: boolean }>(
          'SELECT is_admin, COALESCE(chat_hidden, FALSE) AS chat_hidden FROM users WHERE id = $1',
          [payload.userId]
        );
        socket.data.isAdmin = r.rows[0]?.is_admin ?? false;
        socket.data.chatHidden = r.rows[0]?.chat_hidden ?? false;
      } catch {
        socket.data.isAdmin = false;
        socket.data.chatHidden = false;
      }
      next();
    } catch {
      next(new Error('invalid token'));
    }
  });

  function broadcastOnlineCount() {
    const userIds = new Set<number>();
    for (const [, s] of io.sockets.sockets) {
      if (s.data.isAdmin) continue;
      if (s.data.userId) userIds.add(s.data.userId);
    }
    io.emit('online-count', userIds.size);
  }

  io.on('connection', (socket) => {
    console.log(`[ws] connected: ${socket.data.username}`);
    broadcastOnlineCount();

    // 전투 채널 구독
    socket.on('combat:subscribe', (characterId: number) => {
      socket.join(`combat:${characterId}`);
    });

    socket.on('combat:unsubscribe', (characterId: number) => {
      socket.leave(`combat:${characterId}`);
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
        if (!payload.characterId) return;
        const gr = await query<{ guild_id: number }>(
          'SELECT guild_id FROM guild_members WHERE character_id = $1', [payload.characterId]
        );
        if (gr.rowCount === 0) return;
        scopeId = gr.rows[0].guild_id;
      }

      // chat_hidden 유저: 저장도 브로드캐스트도 안 함 (아예 없었던 것처럼)
      if (socket.data.chatHidden) return;

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
      console.log(`[ws] disconnected: ${socket.data.username}`);
      broadcastOnlineCount();
    });
  });

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
