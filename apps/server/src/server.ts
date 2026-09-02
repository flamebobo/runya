import { buildApp } from './app.js';

async function start() {
  const app = await buildApp();
  const { PORT, APP_BASE_URL } = app.config;

  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info({ url: APP_BASE_URL }, 'runew-server started');
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
