import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { realtimeEventSchema, type RealtimeEvent } from '@runew/contracts';
import type { FastifyInstance } from 'fastify';
import { consumeRealtimeTicket } from './service.js';

type ConnectedClient = {
  socket: WebSocket;
  userId: string;
  sessionId: string;
  familyId: string | null;
  deviceId: string | null;
};

export type RealtimeHub = {
  broadcast(event: RealtimeEvent): void;
  sendToUser(userId: string, event: RealtimeEvent): void;
  revokeSession(sessionId: string, reason?: string): void;
  close(): Promise<void>;
};

declare module 'fastify' {
  interface FastifyInstance {
    realtimeHub: RealtimeHub;
  }
}

function writeUnauthorized(socket: Duplex) {
  socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
  socket.destroy();
}

function matches(client: ConnectedClient, event: RealtimeEvent) {
  return event.familyId == null || client.familyId === event.familyId;
}

/**
 * Attaches a ticket-gated WebSocket transport to Fastify's HTTP server. The
 * transport is deliberately read-only: clients receive hints and must fetch
 * authoritative state through the normal API/sync endpoints.
 */
export function attachRealtimeHub(app: FastifyInstance): RealtimeHub {
  const clients = new Set<ConnectedClient>();
  const server = new WebSocketServer({ noServer: true });

  const send = (client: ConnectedClient, event: RealtimeEvent) => {
    // `OPEN` is a static WebSocket constant; use its protocol value here so
    // this check remains valid for every ws instance and test double.
    if (client.socket.readyState !== 1 || !matches(client, event)) return;
    client.socket.send(JSON.stringify(realtimeEventSchema.parse(event)));
  };

  const onConnection = (socket: WebSocket, auth: { userId: string; sessionId: string; familyId: string | null; deviceId: string | null }) => {
    const client: ConnectedClient = { socket, ...auth };
    clients.add(client);
    socket.on('close', () => clients.delete(client));
    socket.on('error', () => clients.delete(client));
    // Hints are server-to-client only. Do not accept arbitrary client payloads.
    socket.on('message', () => socket.close(1008, 'read-only hint channel'));
  };
  server.on('connection', onConnection);

  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    let url: URL;
    try {
      url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== '/ws') return;
    const ticket = url.searchParams.get('ticket');
    if (!ticket) {
      writeUnauthorized(socket);
      return;
    }
    void consumeRealtimeTicket(app.db, ticket)
      .then((auth) => {
        server.handleUpgrade(request, socket, head, (ws) => onConnection(ws, auth));
      })
      .catch(() => writeUnauthorized(socket));
  };

  app.server.on('upgrade', onUpgrade);

  const hub: RealtimeHub = {
    broadcast(event) {
      for (const client of clients) send(client, event);
    },
    sendToUser(userId, event) {
      for (const client of clients) {
        if (client.userId === userId) send(client, event);
      }
    },
    revokeSession(sessionId, reason = 'session revoked') {
      for (const client of clients) {
        if (client.sessionId !== sessionId) continue;
        send(client, { type: 'session_revoked', reason });
        client.socket.close(4001, reason);
      }
    },
    async close() {
      app.server.off('upgrade', onUpgrade);
      for (const client of clients) client.socket.close(1001, 'server closing');
      clients.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };

  app.addHook('onClose', async () => {
    await hub.close();
  });
  return hub;
}
