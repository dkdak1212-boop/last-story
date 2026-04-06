import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

export function initWebSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN || '*' },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('no token'));
    try {
      const payload = jwt.verify(token, SECRET) as { userId: number; username: string };
      socket.data.userId = payload.userId;
      socket.data.username = payload.username;
      // admin 여부 조회
      query<{ is_admin: boolean }>('SELECT is_admin FROM users WHERE id = $1', [payload.userId])
        .then(r => { socket.data.isAdmin = r.rows[0]?.is_admin ?? false; })
        .catch(() => { socket.data.isAdmin = false; });
      next();
    } catch {
      next(new Error('invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[ws] connected: ${socket.data.username}`);

    socket.on('chat', async (payload: { channel: string; text: string; characterId?: number }) => {
      if (!payload?.text || payload.text.length > 200) return;
      const channel = ['global', 'trade', 'guild', 'party'].includes(payload.channel) ? payload.channel : 'global';
      const text = payload.text.trim();
      if (!text) return;

      let scopeId: number | null = null;
      // 길드/파티 채널은 캐릭터의 소속 범위 필요
      if (channel === 'guild' || channel === 'party') {
        if (!payload.characterId) return;
        if (channel === 'guild') {
          const gr = await query<{ guild_id: number }>(
            'SELECT guild_id FROM guild_members WHERE character_id = $1', [payload.characterId]
          );
          if (gr.rowCount === 0) return;
          scopeId = gr.rows[0].guild_id;
        } else {
          const pr = await query<{ party_id: number }>(
            'SELECT party_id FROM party_members WHERE character_id = $1', [payload.characterId]
          );
          if (pr.rowCount === 0) return;
          scopeId = pr.rows[0].party_id;
        }
      }

      try {
        const r = await query<{ id: number; created_at: string }>(
          `INSERT INTO chat_messages (channel, from_name, text, scope_id)
           VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
          [channel, socket.data.username, text, scopeId]
        );
        io.emit('chat', {
          id: r.rows[0].id,
          channel, scopeId,
          from: socket.data.username,
          text,
          isAdmin: socket.data.isAdmin ?? false,
          createdAt: r.rows[0].created_at,
        });
      } catch (e) {
        console.error('[chat] save error', e);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[ws] disconnected: ${socket.data.username}`);
    });
  });

  return io;
}
