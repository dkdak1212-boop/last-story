import type { Server } from 'socket.io';

let _io: Server | null = null;

export function setIo(io: Server) { _io = io; }
export function getIo(): Server | null { return _io; }
