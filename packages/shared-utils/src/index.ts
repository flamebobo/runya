import { ulid } from 'ulid';

const ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export function createUlid(): string {
  return ulid();
}

export function isUlid(value: string): boolean {
  return ULID_REGEX.test(value);
}

export function utcNowMs(): number {
  return Date.now();
}

export interface CursorPayload {
  after?: string;
  afterAt?: number;
  limit?: number;
}

export interface FeedingSegmentLike {
  startedAt: number;
  endedAt: number | null;
}

export function elapsedSecondsFromRange(
  startedAt: number,
  endedAt: number | null,
  nowMs: number,
): number {
  const end = endedAt ?? nowMs;
  return Math.max(0, Math.floor((end - startedAt) / 1000));
}

export function feedingElapsedSeconds(
  segments: FeedingSegmentLike[],
  nowMs: number,
): number {
  return segments.reduce(
    (sum, segment) =>
      sum + elapsedSecondsFromRange(segment.startedAt, segment.endedAt, nowMs),
    0,
  );
}

export function formatDurationHms(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function formatDurationLabel(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`;
  }
  if (minutes > 0) {
    const rest = seconds % 60;
    return rest > 0 ? `${minutes}分${rest}秒` : `${minutes}分钟`;
  }
  return `${seconds}秒`;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  const parsed = JSON.parse(
    Buffer.from(cursor, 'base64url').toString('utf8'),
  ) as CursorPayload;
  return parsed;
}

export function buildEtag(version: number): string {
  return `"v${version}"`;
}

export function parseIfMatch(header: string | undefined): number | null {
  if (!header) return null;
  const match = header.match(/^"v(\d+)"$/);
  if (!match?.[1]) return null;
  return Number.parseInt(match[1], 10);
}

export function normalizeIdempotencyKey(key: string | undefined): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (trimmed.length < 8 || trimmed.length > 128) return null;
  return trimmed;
}
