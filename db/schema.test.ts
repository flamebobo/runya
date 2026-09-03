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
      expect(await tableExists(databasePath, 'feeding_records')).toBe(true);
      expect(await tableExists(databasePath, 'feeding_segments')).toBe(true);
      expect(await tableExists(databasePath, 'sleep_records')).toBe(true);
      expect(await tableExists(databasePath, 'diaper_records')).toBe(true);
      expect(await tableExists(databasePath, 'food_records')).toBe(true);
      expect(await tableExists(databasePath, 'sync_operations')).toBe(true);
      expect(await tableExists(databasePath, 'duplicate_candidates')).toBe(true);
      expect(await tableExists(databasePath, 'growth_records')).toBe(true);
      expect(await tableExists(databasePath, 'milestones')).toBe(true);
      expect(await tableExists(databasePath, 'knowledge')).toBe(true);
      expect(await tableExists(databasePath, 'knowledge_user_states')).toBe(true);
      expect(await tableExists(databasePath, 'health_events')).toBe(true);
      expect(await tableExists(databasePath, 'health_reminders')).toBe(true);
      expect(await tableExists(databasePath, 'health_event_media')).toBe(true);
      expect(await tableExists(databasePath, 'media_files')).toBe(true);
      expect(await tableExists(databasePath, 'notification_preferences')).toBe(true);
      expect(await tableExists(databasePath, 'notifications')).toBe(true);
      expect(await tableExists(databasePath, 'scheduled_notifications')).toBe(true);
      expect(await tableExists(databasePath, 'job_locks')).toBe(true);

      const client = createSqlClient(databasePath);
      await client.execute('PRAGMA foreign_keys = ON');
      await client.execute({
        sql: "INSERT INTO users (id, nickname, status, locale, created_at, updated_at) VALUES ('01JTESTUSER0000000000000001', '妈妈', 'ACTIVE', 'zh-CN', 1, 1)",
        args: [],
      });
      await client.execute({
        sql: "INSERT INTO families (id, name, owner_user_id, timezone_name, created_at, updated_at, version) VALUES ('01JTESTFAMILY0000000000001', '小家', '01JTESTUSER0000000000000001', 'Asia/Shanghai', 1, 1, 1)",
        args: [],
      });
      await client.execute({
        sql: "INSERT INTO babies (id, family_id, name, birthday, created_by, created_at, updated_by, updated_at, version) VALUES ('01JTESTBABY000000000000001', '01JTESTFAMILY0000000000001', '润润', '2026-01-16', '01JTESTUSER0000000000000001', 1, '01JTESTUSER0000000000000001', 1, 1)",
        args: [],
      });
      await client.execute({
        sql: "INSERT INTO sleep_records (id, family_id, baby_id, status, started_at, start_timezone, created_by, created_at, updated_by, updated_at, version) VALUES ('01JTESTSLEEP00000000000001', '01JTESTFAMILY0000000000001', '01JTESTBABY000000000000001', 'RUNNING', 1, 'Asia/Shanghai', '01JTESTUSER0000000000000001', 1, '01JTESTUSER0000000000000001', 1, 1)",
        args: [],
      });
      await expect(
        client.execute({
          sql: "INSERT INTO sleep_records (id, family_id, baby_id, status, started_at, start_timezone, created_by, created_at, updated_by, updated_at, version) VALUES ('01JTESTSLEEP00000000000002', '01JTESTFAMILY0000000000001', '01JTESTBABY000000000000001', 'RUNNING', 2, 'Asia/Shanghai', '01JTESTUSER0000000000000001', 1, '01JTESTUSER0000000000000001', 1, 1)",
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
