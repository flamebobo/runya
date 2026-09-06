import { realtimeEventSchema, realtimeTicketSchema, type RealtimeEvent } from '@runew/contracts';
import Taro from '@tarojs/taro';
import { getClientPlatform } from '@/api/client';
import { issueRealtimeTicket } from '@/api/m11';

export interface RealtimeChannel {
  close: () => void;
}

interface RealtimeChannelOptions {
  familyId: string;
  onEvent: (event: RealtimeEvent) => void;
  onClose: () => void;
}

type SocketMessage = { data: string | ArrayBuffer };

interface TaroSocketTask {
  onMessage: (callback: (message: SocketMessage) => void) => void;
  onClose: (callback: () => void) => void;
  onError: (callback: () => void) => void;
  close: (options: { code?: number; reason?: string }) => void;
}

const REALTIME_PATH = '/ws';

function websocketOrigin(): string | null {
  const configuredApiBase =
    typeof process !== 'undefined' && process.env.TARO_APP_API_BASE
      ? process.env.TARO_APP_API_BASE
      : null;

  if (getClientPlatform() === 'H5') {
    if (typeof window === 'undefined') return null;
    const base = new URL(configuredApiBase ?? window.location.href, window.location.href);
    return `${base.protocol === 'https:' ? 'wss:' : 'ws:'}//${base.host}`;
  }

  if (!configuredApiBase) return null;
  const base = new URL(configuredApiBase);
  return `${base.protocol === 'https:' ? 'wss:' : 'ws:'}//${base.host}`;
}

function parseRealtimeEvent(data: string | ArrayBuffer): RealtimeEvent | null {
  let text: string;
  if (typeof data === 'string') {
    text = data;
  } else if (data instanceof ArrayBuffer && typeof TextDecoder !== 'undefined') {
    text = new TextDecoder().decode(data);
  } else {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(text);
    const result = realtimeEventSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function bindBrowserSocket(socket: WebSocket, options: RealtimeChannelOptions): RealtimeChannel {
  let closed = false;
  socket.onmessage = (message) => {
    const event = parseRealtimeEvent(message.data as string | ArrayBuffer);
    if (event) options.onEvent(event);
  };
  socket.onclose = () => {
    if (!closed) options.onClose();
  };
  socket.onerror = () => undefined;

  return {
    close: () => {
      closed = true;
      socket.close();
    },
  };
}

export async function openRealtimeChannel(options: RealtimeChannelOptions): Promise<RealtimeChannel | null> {
  const origin = websocketOrigin();
  if (!origin) return null;

  const ticketResponse = await issueRealtimeTicket(options.familyId);
  const ticket = realtimeTicketSchema.safeParse(ticketResponse);
  if (!ticket.success || ticket.data.expiresAt <= Date.now()) return null;
  const url = `${origin}${REALTIME_PATH}?ticket=${encodeURIComponent(ticket.data.ticket)}`;

  if (getClientPlatform() === 'H5') {
    if (typeof WebSocket === 'undefined') return null;
    const socket = new WebSocket(url);
    return bindBrowserSocket(socket, options);
  }

  const task = (await Taro.connectSocket({ url })) as unknown as TaroSocketTask;
  let closed = false;
  const handleMessage = (message: SocketMessage) => {
    const event = parseRealtimeEvent(message.data);
    if (event) options.onEvent(event);
  };
  task.onMessage(handleMessage);
  task.onClose(() => {
    if (!closed) options.onClose();
  });
  task.onError(() => undefined);

  return {
    close: () => {
      closed = true;
      task.close({ code: 1000, reason: 'client cleanup' });
    },
  };
}
