import { createHash, createHmac, randomBytes } from 'node:crypto';

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashInviteToken(token: string): string {
  return hashToken(token);
}

export function generateInviteToken(): string {
  return randomBytes(24).toString('base64url');
}

export function generateIdempotentInviteToken(secret: string, scope: string): string {
  return createHmac('sha256', secret)
    .update(`runew:family-invite:${scope}`)
    .digest()
    .subarray(0, 24)
    .toString('base64url');
}

export function hashClientMetadata(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stableRequestHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
