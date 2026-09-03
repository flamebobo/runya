import {
  createSuccessEnvelope,
  updateNotificationPreferencesBodySchema,
} from '@runew/contracts';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../plugins/auth.js';
import {
  getPreferences,
  listNotifications,
  markAllRead,
  markRead,
  updatePreferences,
} from './service.js';

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/notifications', { preHandler: requireAuth }, async (request) => {
    const result = await listNotifications(app.db, request.auth.userId!);
    return createSuccessEnvelope(result, request.requestId);
  });

  app.post('/notifications/:id/read', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await markRead(app.db, request.auth.userId!, id);
    return createSuccessEnvelope(result, request.requestId);
  });

  app.post('/notifications/read-all', { preHandler: requireAuth }, async (request) => {
    const result = await markAllRead(app.db, request.auth.userId!);
    return createSuccessEnvelope(result, request.requestId);
  });

  app.get('/notification-preferences', { preHandler: requireAuth }, async (request) => {
    const result = await getPreferences(app.db, request.auth.userId!);
    return createSuccessEnvelope(result, request.requestId);
  });

  app.put('/notification-preferences', { preHandler: requireAuth }, async (request) => {
    const body = updateNotificationPreferencesBodySchema.parse(request.body);
    const result = await updatePreferences(app.db, request.auth.userId!, body);
    return createSuccessEnvelope(result, request.requestId);
  });
}
