import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createSqlClient,
  getForeignKeysEnabled,
  getJournalMode,
  runMigrations,
  tableExists,
} from '@runew/db';

describe('database foundation', () => {
  it('migrates empty database and enables WAL + FK', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-db-'));
    const databasePath = path.join(tempDir, 'runew.db');

    try {
      await runMigrations(databasePath);
      expect(await getJournalMode(databasePath)).toBe('wal');
      expect(await getForeignKeysEnabled(databasePath)).toBe(true);
      expect(await tableExists(databasePath, 'users')).toBe(true);
      expect(await tableExists(databasePath, 'babies')).toBe(true);
      expect(await tableExists(databasePath, 'idempotency_keys')).toBe(true);
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore Windows file lock during cleanup
      }
    }
  });

  it('enforces foreign keys', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-db-fk-'));
    const databasePath = path.join(tempDir, 'runew.db');

    try {
      await runMigrations(databasePath);
      const client = createSqlClient(databasePath);
      await client.execute('PRAGMA foreign_keys = ON');

      await expect(
        client.execute({
          sql: "INSERT INTO babies (id, family_id, name, birthday, created_by, created_at, updated_by, updated_at, version) VALUES ('01JTESTBABY000000000000001', 'missing-family', '润润', '2026-01-16', 'missing-user', 1, 'missing-user', 1, 1)",
          args: [],
        }),
      ).rejects.toThrow();

      await client.close();
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore Windows file lock during cleanup
      }
    }
  });
});
