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
  limit?: number;
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
