import { describe, expect, it } from 'vitest';
import {
  buildEtag,
  createUlid,
  decodeCursor,
  encodeCursor,
  isUlid,
  normalizeIdempotencyKey,
  parseIfMatch,
} from './index.js';

describe('shared-utils', () => {
  it('creates and validates ULID', () => {
    const id = createUlid();
    expect(isUlid(id)).toBe(true);
    expect(isUlid('not-a-ulid')).toBe(false);
  });

  it('encodes and decodes cursor', () => {
    const cursor = encodeCursor({ after: 'abc', limit: 20 });
    expect(decodeCursor(cursor)).toEqual({ after: 'abc', limit: 20 });
  });

  it('builds and parses etag', () => {
    expect(buildEtag(3)).toBe('"v3"');
    expect(parseIfMatch('"v3"')).toBe(3);
    expect(parseIfMatch(undefined)).toBeNull();
  });

  it('normalizes idempotency key', () => {
    expect(normalizeIdempotencyKey('  abcdefgh  ')).toBe('abcdefgh');
    expect(normalizeIdempotencyKey('short')).toBeNull();
  });
});
