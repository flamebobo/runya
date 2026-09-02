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
