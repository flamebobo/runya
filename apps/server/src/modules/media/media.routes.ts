import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import {
  initUploadBodySchema,
  completeUploadBodySchema,
  createSuccessEnvelope,
} from '@runew/contracts';
import { requireAuth } from '../../plugins/auth.js';
import {
  initUploadSession,
  verifyUploadToken,
  saveUploadPart,
  getUploadSessionState,
  assembleCompletedUpload,
  assertUploadActorPermission,
} from './upload.service.js';
import { processCompletedMedia } from './processing.service.js';
import { checkMediaAccessPermission, getMediaFilePath } from './media.service.js';
import { AppError } from '../../lib/errors.js';

export async function mediaRoutes(fastify: FastifyInstance) {
  // Support raw binary buffer parsing for chunk uploads
  fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, payload, done) => {
    done(null, payload);
  });
  fastify.addContentTypeParser('image/*', { parseAs: 'buffer' }, (_req, payload, done) => {
    done(null, payload);
  });
  fastify.addContentTypeParser('audio/*', { parseAs: 'buffer' }, (_req, payload, done) => {
    done(null, payload);
  });

  // POST /media/uploads - Init Upload Session
  fastify.post('/media/uploads', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const body = initUploadBodySchema.parse(request.body);

    // Get active family of user
    const membership = await request.db.query.familyMembers.findFirst({
      where: (fm, { and, eq }) =>
        and(eq(fm.userId, userId), eq(fm.status, 'ACTIVE')),
    });

    if (!membership) {
      throw new AppError('FAMILY_ACCESS_DENIED', '尚未加入任何家庭', 400);
    }

    if (body.babyId) {
      const baby = await request.db.query.babies.findFirst({
        where: (babies, { and, eq, isNull }) =>
          and(
            eq(babies.id, body.babyId!),
            eq(babies.familyId, membership.familyId),
            isNull(babies.deletedAt),
          ),
      });
      if (!baby) {
        throw new AppError('FAMILY_ACCESS_DENIED', '無權為這個寶寶新增媒體', 403);
      }
    }

    const result = await initUploadSession(request.db, userId, membership.familyId, body);
    return createSuccessEnvelope(result, request.id);
  });

  // PUT /media/uploads/:uploadId/parts/:partNo - Upload Part Chunk (token protected)
  fastify.put('/media/uploads/:uploadId/parts/:partNo', async (request, reply) => {
    const { uploadId, partNo: rawPartNo } = request.params as { uploadId: string; partNo: string };
    const partNo = parseInt(rawPartNo, 10);

    if (isNaN(partNo) || partNo < 1) {
      throw new AppError('VALIDATION_ERROR', '非法的分块编号', 400);
    }

    const token =
      (request.headers['x-upload-token'] as string) ||
      (request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '');

    if (!token) {
      throw new AppError('AUTHENTICATION_REQUIRED', '缺少上传令牌', 401);
    }

    await verifyUploadToken(request.db, uploadId, token);

    let buffer: Buffer;
    if (Buffer.isBuffer(request.body)) {
      buffer = request.body;
    } else if (typeof request.body === 'string') {
      buffer = Buffer.from(request.body, 'utf8');
    } else {
      buffer = Buffer.alloc(0);
    }

    if (buffer.length === 0) {
      throw new AppError('VALIDATION_ERROR', '分块数据不能为空', 400);
    }

    const result = await saveUploadPart(request.db, uploadId, partNo, buffer);
    return createSuccessEnvelope(result, request.id);
  });

  // GET /media/uploads/:uploadId - Query Upload State
  fastify.get('/media/uploads/:uploadId', async (request, reply) => {
    const { uploadId } = request.params as { uploadId: string };
    const token =
      (request.headers['x-upload-token'] as string) ||
      (request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '');
    if (!token) {
      throw new AppError('AUTHENTICATION_REQUIRED', '缺少上傳權杖', 401);
    }
    await verifyUploadToken(request.db, uploadId, token);
    const result = await getUploadSessionState(request.db, uploadId);
    return createSuccessEnvelope(result, request.id);
  });

  // POST /media/uploads/:uploadId/complete - Complete Upload Assembly & Processing
  fastify.post('/media/uploads/:uploadId/complete', { preHandler: requireAuth }, async (request, reply) => {
    const { uploadId } = request.params as { uploadId: string };
    const userId = request.auth.userId!;
    const body = request.body ? completeUploadBodySchema.parse(request.body) : {};

    await assertUploadActorPermission(request.db, uploadId, userId);
    const assembled = await assembleCompletedUpload(request.db, uploadId, body.finalSha256);

    const processed = await processCompletedMedia(
      request.db,
      assembled.mediaId,
      uploadId,
      assembled.assembledPath,
      assembled.sha256,
      assembled.sizeBytes,
    );

    return createSuccessEnvelope(processed, request.id);
  });

  // GET /media/:id/content - Authenticated Content Delivery with Range Request Support
  fastify.get('/media/:id/content', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };

    const media = await checkMediaAccessPermission(request.db, userId, id);
    const storageKey = media.storageKey || media.originalStorageKey;

    if (!storageKey) {
      throw new AppError('NOT_FOUND', '媒体资源文件尚未就绪', 404);
    }

    const filePath = await getMediaFilePath(storageKey);
    const stat = await fsp.stat(filePath);
    const totalSize = stat.size;

    const rawRange = request.headers.range;
    const rangeHeader = Array.isArray(rawRange) ? rawRange[0] : rawRange;

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

        if (start >= totalSize || end >= totalSize || start > end) {
          reply.status(416).headers({
            'Content-Range': `bytes */${totalSize}`,
          });
          return reply.send(new AppError('VALIDATION_ERROR', '请求的 Range 超出范围', 416));
        }

        const chunkSize = end - start + 1;
        const stream = fs.createReadStream(filePath, { start, end });

        reply.raw.statusCode = 206;
        reply.raw.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
        reply.raw.setHeader('Accept-Ranges', 'bytes');
        reply.raw.setHeader('Content-Length', chunkSize.toString());
        reply.raw.setHeader('Content-Type', media.mimeType);

        return reply.send(stream);
      }
    }

    // Full Content
    const stream = fs.createReadStream(filePath);
    reply.raw.statusCode = 200;
    reply.raw.setHeader('Accept-Ranges', 'bytes');
    reply.raw.setHeader('Content-Length', totalSize.toString());
    reply.raw.setHeader('Content-Type', media.mimeType);

    return reply.send(stream);
  });

  // GET /media/:id/thumbnail - Authenticated Thumbnail Delivery
  fastify.get('/media/:id/thumbnail', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };

    const media = await checkMediaAccessPermission(request.db, userId, id);
    const thumbKey = media.thumbnailStorageKey || media.storageKey || media.originalStorageKey;

    if (!thumbKey) {
      throw new AppError('NOT_FOUND', '媒体缩略图不存在', 404);
    }

    const filePath = await getMediaFilePath(thumbKey);
    const stat = await fsp.stat(filePath);
    const stream = fs.createReadStream(filePath);

    reply.raw.statusCode = 200;
    reply.raw.setHeader('Content-Length', stat.size.toString());
    reply.raw.setHeader('Content-Type', media.mimeType);

    return reply.send(stream);
  });
}
