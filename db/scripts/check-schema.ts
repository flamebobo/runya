import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getForeignKeysEnabled,
  getJournalMode,
  runMigrations,
  tableExists,
} from '@runew/db';

const REQUIRED_TABLES = [
  'system_metadata',
  'users',
  'user_auth_credentials',
  'user_sessions',
  'devices',
  'families',
  'family_members',
  'family_member_permissions',
  'family_invites',
  'babies',
  'feeding_records',
  'feeding_segments',
  'sleep_records',
  'diaper_records',
  'food_records',
  'sync_operations',
  'duplicate_candidates',
  'knowledge',
  'knowledge_user_states',
  'health_events',
  'health_reminders',
  'health_event_media',
  'media_files',
  'notification_preferences',
  'notifications',
  'scheduled_notifications',
  'job_locks',
  'moods',
  'diaries',
  'diary_media',
  'gem_rules',
  'gem_transactions',
  'rewards',
  'reward_orders',
  'baby_preferences',
  'baby_changes',
  'user_settings',
  'backup_runs',
  'export_jobs',
  'search_documents',
  'search_documents_fts',
  'realtime_tickets',
  'admin_credentials',
  'admin_sessions',
  'admin_reauth_grants',
  'audit_logs',
  'system_settings',
] as const;

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-db-check-'));
  const databasePath = path.join(tempDir, 'runew.db');

  try {
    await runMigrations(databasePath);

    const journalMode = await getJournalMode(databasePath);
    const foreignKeys = await getForeignKeysEnabled(databasePath);

    if (journalMode !== 'wal') {
      throw new Error(`Expected journal_mode WAL, got ${journalMode}`);
    }

    if (!foreignKeys) {
      throw new Error('Expected foreign_keys ON');
    }

    for (const table of REQUIRED_TABLES) {
      if (!(await tableExists(databasePath, table))) {
        throw new Error(`Missing table: ${table}`);
      }
    }

    console.log('Database schema check passed');
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Windows may briefly lock SQLite sidecar files after libsql closes.
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
