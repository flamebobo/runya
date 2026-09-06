import { describe, expect, it } from 'vitest';
import { ADMIN_MODULES, formatAdminSessionRemaining } from './AdminModules';

describe('AdminModules', () => {
  it('formats an absolute admin-session countdown without going negative', () => {
    const now = 1_000_000;
    expect(formatAdminSessionRemaining(now + 30 * 60_000, now)).toBe('30:00');
    expect(formatAdminSessionRemaining(now + 1_250, now)).toBe('0:01');
    expect(formatAdminSessionRemaining(now - 1, now)).toBe('0:00');
  });

  it('exposes one stable entry for every admin domain', () => {
    const keys = ADMIN_MODULES.map((module) => module.key);
    expect(keys).toEqual([
      'gems',
      'rules',
      'rewards',
      'knowledge',
      'content',
      'members',
      'data',
      'system',
      'audit',
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
