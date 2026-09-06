import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './schema/index.js';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageRoot, '../../..');
const migrationsFolder = path.join(repoRoot, 'db/migrations');

export interface DatabaseConnectionOptions {
  databasePath: string;
}

function toFileUrl(databasePath: string): string {
  const absolutePath = path.resolve(databasePath);
  return `file:${absolutePath.replace(/\\/g, '/')}`;
}

export function createSqlClient(databasePath: string): Client {
  const dir = path.dirname(databasePath);
  fs.mkdirSync(dir, { recursive: true });
  return createClient({ url: toFileUrl(databasePath) });
}

export async function configureSqlitePragmas(client: Client) {
  await client.execute('PRAGMA foreign_keys = ON');
  await client.execute('PRAGMA journal_mode = WAL');
  await client.execute('PRAGMA busy_timeout = 5000');
}

export function openDatabase(options: DatabaseConnectionOptions) {
  const client = createSqlClient(options.databasePath);
  return {
    client,
    db: drizzle(client, { schema }),
  };
}

export async function openDatabaseAsync(options: DatabaseConnectionOptions): Promise<{
  client: Client;
  db: LibSQLDatabase<typeof schema>;
}> {
  const connection = openDatabase(options);
  await configureSqlitePragmas(connection.client);
  return connection;
}

export async function runMigrations(databasePath: string) {
  const { client, db } = await openDatabaseAsync({ databasePath });
  await repairKnownSchemaDrift(client);
  await migrate(db, { migrationsFolder });
  await client.close();
}

/** Repairs databases migrated before capsule_state was added to search_documents. */
export async function repairKnownSchemaDrift(client: Client) {
  const result = await client.execute('PRAGMA table_info(search_documents)');
  if (result.rows.length === 0) return;
  const hasCapsuleState = result.rows.some((row) => String(row.name ?? '') === 'capsule_state');
  if (!hasCapsuleState) await client.execute('ALTER TABLE search_documents ADD COLUMN capsule_state text');
}

export async function getJournalMode(databasePath: string): Promise<string> {
  const client = createSqlClient(databasePath);
  const result = await client.execute('PRAGMA journal_mode');
  await client.close();
  const value = result.rows[0]?.[0];
  return String(value ?? '').toLowerCase();
}

export async function getForeignKeysEnabled(databasePath: string): Promise<boolean> {
  const client = createSqlClient(databasePath);
  const result = await client.execute('PRAGMA foreign_keys');
  await client.close();
  return Number(result.rows[0]?.[0] ?? 0) === 1;
}

export async function tableExists(
  databasePath: string,
  tableName: string,
): Promise<boolean> {
  const client = createSqlClient(databasePath);
  const result = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1",
    args: [tableName],
  });
  await client.close();
  return result.rows.length > 0;
}

export { schema };
