import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createSqlClient,
  getForeignKeysEnabled,
  getJournalMode,
  runMigrations,
  repairKnownSchemaDrift,
  tableExists,
} from '@runew/db';

describe('database foundation', () => {
  it('repairs the legacy search document shape before migrations reference capsule_state', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-db-drift-'));
    const databasePath = path.join(tempDir, 'runew.db');
    const client = createSqlClient(databasePath);
    try {
      await client.execute('CREATE TABLE search_documents (rowid INTEGER PRIMARY KEY, body text NOT NULL)');
      await repairKnownSchemaDrift(client);
      const columns = await client.execute('PRAGMA table_info(search_documents)');
      expect(columns.rows.some((row) => String(row.name ?? '') === 'capsule_state')).toBe(true);
    } finally {
      await client.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

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
      expect(await tableExists(databasePath, 'family_tasks')).toBe(true);
      expect(await tableExists(databasePath, 'duplicate_candidates')).toBe(true);
      expect(await tableExists(databasePath, 'growth_records')).toBe(true);
      expect(await tableExists(databasePath, 'milestones')).toBe(true);
      expect(await tableExists(databasePath, 'knowledge')).toBe(true);
      expect(await tableExists(databasePath, 'knowledge_user_states')).toBe(true);
      expect(await tableExists(databasePath, 'health_events')).toBe(true);
      expect(await tableExists(databasePath, 'health_reminders')).toBe(true);
      expect(await tableExists(databasePath, 'health_event_media')).toBe(true);
      expect(await tableExists(databasePath, 'media_files')).toBe(true);
      expect(await tableExists(databasePath, 'media_uploads')).toBe(true);
      expect(await tableExists(databasePath, 'media_upload_parts')).toBe(true);
      expect(await tableExists(databasePath, 'photo_memories')).toBe(true);
      expect(await tableExists(databasePath, 'photo_memory_media')).toBe(true);
      expect(await tableExists(databasePath, 'baby_quotes')).toBe(true);
      expect(await tableExists(databasePath, 'audio_memories')).toBe(true);
      expect(await tableExists(databasePath, 'first_moments')).toBe(true);
      expect(await tableExists(databasePath, 'first_moment_media')).toBe(true);
      expect(await tableExists(databasePath, 'time_capsules')).toBe(true);
      expect(await tableExists(databasePath, 'time_capsule_media')).toBe(true);
      expect(await tableExists(databasePath, 'notification_preferences')).toBe(true);
      expect(await tableExists(databasePath, 'notifications')).toBe(true);
      expect(await tableExists(databasePath, 'scheduled_notifications')).toBe(true);
      expect(await tableExists(databasePath, 'job_locks')).toBe(true);
      expect(await tableExists(databasePath, 'gem_rules')).toBe(true);
      expect(await tableExists(databasePath, 'gem_transactions')).toBe(true);
      expect(await tableExists(databasePath, 'rewards')).toBe(true);
      expect(await tableExists(databasePath, 'reward_orders')).toBe(true);
      expect(await tableExists(databasePath, 'admin_credentials')).toBe(true);
      expect(await tableExists(databasePath, 'admin_sessions')).toBe(true);
      expect(await tableExists(databasePath, 'admin_reauth_grants')).toBe(true);
      expect(await tableExists(databasePath, 'audit_logs')).toBe(true);
      expect(await tableExists(databasePath, 'system_settings')).toBe(true);
      expect(await tableExists(databasePath, 'baby_preferences')).toBe(true);
      expect(await tableExists(databasePath, 'baby_changes')).toBe(true);
      expect(await tableExists(databasePath, 'user_settings')).toBe(true);
      expect(await tableExists(databasePath, 'backup_runs')).toBe(true);
      expect(await tableExists(databasePath, 'export_jobs')).toBe(true);
      expect(await tableExists(databasePath, 'search_documents')).toBe(true);
      expect(await tableExists(databasePath, 'search_documents_fts')).toBe(true);
      expect(await tableExists(databasePath, 'realtime_tickets')).toBe(true);

      const client = createSqlClient(databasePath);
      await client.execute('PRAGMA foreign_keys = ON');
      const familyTaskColumns = await client.execute('PRAGMA table_info(family_tasks)');
      expect(familyTaskColumns.rows.some((row) => String(row.name ?? '') === 'status')).toBe(true);
      expect(familyTaskColumns.rows.some((row) => String(row.name ?? '') === 'deleted_at')).toBe(true);
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
      await client.execute({ sql: "INSERT INTO gem_transactions (id, family_id, user_id, amount, balance_after, reason_code, source_type, idempotency_key, created_at) VALUES ('01JTESTGEM0000000000000001', '01JTESTFAMILY0000000000001', '01JTESTUSER0000000000000001', 1, 1, 'RECORD_CREATED', 'RECORD_REWARD', 'schema-test-gem', 1)", args: [] });
      await expect(client.execute({ sql: "UPDATE gem_transactions SET amount = 9 WHERE id = '01JTESTGEM0000000000000001'", args: [] })).rejects.toThrow(/immutable/);
      await expect(client.execute({ sql: "DELETE FROM gem_transactions WHERE id = '01JTESTGEM0000000000000001'", args: [] })).rejects.toThrow(/immutable/);
      await client.execute({
        sql: "INSERT INTO audit_logs (id, request_id, action, resource_type, result, created_at) VALUES ('01JTESTAUDIT000000000000001', 'req-schema', 'TEST', 'TEST', 'SUCCESS', 1)",
        args: [],
      });
      await expect(client.execute({ sql: "UPDATE audit_logs SET action = 'CHANGED' WHERE id = '01JTESTAUDIT000000000000001'", args: [] })).rejects.toThrow(/immutable/);
      await expect(client.execute({ sql: "DELETE FROM audit_logs WHERE id = '01JTESTAUDIT000000000000001'", args: [] })).rejects.toThrow(/immutable/);
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
