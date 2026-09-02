import { describe, expect, it } from 'vitest';
import { friendlyRecordError } from './friendlyRecordError';

describe('friendlyRecordError', () => {
  it('rewrites empty-string Zod English into product copy', () => {
    expect(friendlyRecordError('String must contain at least 1 character(s)')).toBe(
      '先写一写今天吃了什么',
    );
  });

  it('keeps already-warm Chinese messages', () => {
    expect(friendlyRecordError('先给宝宝起一个小名字')).toBe('先给宝宝起一个小名字');
  });
});
