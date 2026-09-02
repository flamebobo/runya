import path from 'node:path';
import { runMigrations } from '@runew/db';

async function main() {
  const databasePath =
    process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'runew.db');
  await runMigrations(databasePath);
  console.log(`Migrations applied to ${databasePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
