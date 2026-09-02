import type { Client } from '@libsql/client';
import { configureSqlitePragmas, createSqlClient, schema } from '@runew/db';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    db: LibSQLDatabase<typeof schema>;
    sqlClient: Client;
  }
}

async function dbPlugin(app: FastifyInstance) {
  const client = createSqlClient(app.config.DATABASE_PATH);
  await configureSqlitePragmas(client);
  const db = drizzle(client, { schema });

  app.decorate('sqlClient', client);
  app.decorate('db', db);

  app.addHook('onClose', async () => {
    await client.close();
  });
}

export default fp(dbPlugin, { name: 'db' });
