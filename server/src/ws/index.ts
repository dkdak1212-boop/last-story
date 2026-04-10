import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { toggleAutoMode, manualSkillUse } from '../combat/engine.js';

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

export function initWebSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN || '*' },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('no token'));
    try {
      const payload = jwt.verify(token, SECRET) as { userId: number; username: string };
      socket.data.userId = payload.userId;
      socket.data.username = payload.username;
      // is_admin 동기로 가져와야 broadcastOnlineCount가 정확
      try {
        const r = await query<{ is_admin: boolean }>('SELECT is_admin FROM users WHERE id = $1', [payload.userId]);
        socket.data.isAdmin = r.rows[0]?.is_admin ?? false;
      } catch {
        socket.data.isAdmin = false;
      }
      next();
    } catch {
      next(new Error('invalid token'));
    }
  });

  function broadcastOnlineCount() {
    // 같은 userId 중복 제거 (다중 탭 카운트 방지)
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

    // 채팅
    socket.on('chat', async (payload: { channel: string; text: string; characterId?: number }) => {
      if (!payload?.text || payload.text.length > 200) return;
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
