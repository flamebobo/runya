import { buildApp } from './app.js';
import { startScheduler } from './modules/notifications/scheduler.js';

async function start() {
  const app = await buildApp();
  const { PORT, APP_BASE_URL } = app.config;

  // M6：进程内最小可靠 Scheduler（due notifications + health event 过期）。
  // 幂等 + job_locks，重启不重复通知。
  const scheduler = startScheduler(app.db, app.log);
  app.addHook('onClose', async () => {
    scheduler.stop();
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info({ url: APP_BASE_URL }, 'runew-server started');
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
