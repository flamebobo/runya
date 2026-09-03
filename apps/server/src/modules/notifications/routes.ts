import {
  apiOkResponseSchema,
  notificationListResponseSchema,
  notificationPreferencesSchema,
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
    const result = notificationListResponseSchema.parse(
      await listNotifications(app.db, request.auth.userId!),
    );
    return createSuccessEnvelope(result, request.requestId);
  });

  app.post('/notifications/:id/read', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const result = apiOkResponseSchema.parse(
      await markRead(app.db, request.auth.userId!, id),
    );
    return createSuccessEnvelope(result, request.requestId);
  });

  app.post('/notifications/read-all', { preHandler: requireAuth }, async (request) => {
    const result = apiOkResponseSchema.parse(
      await markAllRead(app.db, request.auth.userId!),
    );
    return createSuccessEnvelope(result, request.requestId);
  });

  app.get('/notification-preferences', { preHandler: requireAuth }, async (request) => {
    const result = notificationPreferencesSchema.parse(
      await getPreferences(app.db, request.auth.userId!),
    );
    return createSuccessEnvelope(result, request.requestId);
  });

  app.put('/notification-preferences', { preHandler: requireAuth }, async (request) => {
    const body = updateNotificationPreferencesBodySchema.parse(request.body);
    const result = notificationPreferencesSchema.parse(
      await updatePreferences(app.db, request.auth.userId!, body),
    );
    return createSuccessEnvelope(result, request.requestId);
  });
}
