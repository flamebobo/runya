import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { eq, and } from 'drizzle-orm';
import { mediaFiles, mediaUploads, mediaUploadParts } from '@runew/db';
import type { InitUploadBody } from '@runew/contracts';
import { createUlid } from '@runew/shared-utils';
import { AppError } from '../../lib/errors.js';
import type { Database } from '../../plugins/db.js';

const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB
const UPLOAD_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getMediaStorageDir(): string {
  const customPath = process.env.RUNEW_DATA_DIR;
  if (customPath) {
    return path.resolve(customPath, 'media');
  }
  return path.resolve(process.cwd(), 'data', 'media');
}

export function getTmpUploadsDir(uploadId: string): string {
  return path.join(getMediaStorageDir(), 'tmp', uploadId);
}

export async function initUploadSession(
  db: Database,
  actorUserId: string,
  familyId: string,
  body: InitUploadBody,
) {
  const now = Date.now();
  const mediaId = createUlid();
  const uploadId = createUlid();
  const uploadToken = crypto.randomBytes(32).toString('hex');
  const uploadTokenHash = crypto.createHash('sha256').update(uploadToken).digest('hex');

  // Insert media_files record
  await db.insert(mediaFiles).values({
    id: mediaId,
    familyId,
    babyId: body.babyId ?? null,
    ownerUserId: actorUserId,
    mediaType: body.mediaType,
    status: 'PENDING',
    mimeType: body.mimeType,
    originalFilename: body.originalFilename ?? null,
    sizeBytes: body.expectedSize,
    sha256: body.expectedSha256 ?? null,
    keepOriginal: true,
    createdAt: now,
    updatedAt: now,
    version: 1,
  });

  const expiresAt = now + UPLOAD_EXPIRY_MS;

  // Insert media_uploads record
  await db.insert(mediaUploads).values({
    id: uploadId,
    mediaId,
    uploadTokenHash,
    expectedSize: body.expectedSize,
    expectedSha256: body.expectedSha256 ?? null,
    chunkSize: DEFAULT_CHUNK_SIZE,
    receivedBytes: 0,
    status: 'INIT',
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  return {
    uploadId,
    mediaId,
    uploadToken,
    chunkSize: DEFAULT_CHUNK_SIZE,
    expiresAt,
  };
}

export async function verifyUploadToken(db: Database, uploadId: string, token: string) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const upload = await db.query.mediaUploads.findFirst({
    where: eq(mediaUploads.id, uploadId),
  });

  if (!upload) {
    throw new AppError('NOT_FOUND', '上传会话不存在', 404);
  }

  if (upload.uploadTokenHash !== tokenHash) {
    throw new AppError('PERMISSION_DENIED', '上传令牌无效', 403);
  }

  if (upload.expiresAt < Date.now()) {
    await db
      .update(mediaUploads)
      .set({ status: 'EXPIRED', updatedAt: Date.now() })
      .where(eq(mediaUploads.id, uploadId));
    throw new AppError('GONE', '上传会话已过期', 410);
  }

  return upload;
}

export async function assertUploadActorPermission(
  db: Database,
  uploadId: string,
  actorUserId: string,
) {
  const upload = await db.query.mediaUploads.findFirst({
    where: eq(mediaUploads.id, uploadId),
  });
  if (!upload) {
    throw new AppError('NOT_FOUND', '上傳會話不存在', 404);
  }

  const media = await db.query.mediaFiles.findFirst({
    where: eq(mediaFiles.id, upload.mediaId),
  });
  if (!media) {
    throw new AppError('NOT_FOUND', '媒體記錄不存在', 404);
  }

  if (media.ownerUserId !== actorUserId) {
    throw new AppError('FAMILY_ACCESS_DENIED', '無權完成這個上傳會話', 403);
  }

  return { upload, media };
}

export async function saveUploadPart(
  db: Database,
  uploadId: string,
  partNo: number,
  buffer: Buffer,
) {
  const upload = await db.query.mediaUploads.findFirst({
    where: eq(mediaUploads.id, uploadId),
  });

  if (!upload) {
    throw new AppError('NOT_FOUND', '上传会话不存在', 404);
  }

  if (upload.status === 'COMPLETE' || upload.status === 'EXPIRED') {
    throw new AppError('VALIDATION_ERROR', '上传会话已关闭', 400);
  }

  if (buffer.length > upload.chunkSize) {
    throw new AppError('VALIDATION_ERROR', '單一分塊超過允許大小', 400);
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const sizeBytes = buffer.length;

  // Check if part already exists (Idempotent Part Retry)
  const existingPart = await db.query.mediaUploadParts.findFirst({
    where: and(
      eq(mediaUploadParts.uploadId, uploadId),
      eq(mediaUploadParts.partNo, partNo),
    ),
  });

  if (existingPart) {
    if (existingPart.sha256 === sha256 && existingPart.sizeBytes === sizeBytes) {
      // Same part retry success
      return {
        uploadId,
        partNo,
        sizeBytes,
        sha256,
        receivedBytes: upload.receivedBytes,
      };
    }
    // Content mismatch for same part number
    throw new AppError('VALIDATION_ERROR', '分块校验 Hash 与已有记录不一致', 400);
  }

  if (upload.receivedBytes + buffer.length > upload.expectedSize) {
    throw new AppError('VALIDATION_ERROR', '上傳內容超過預期大小', 400);
  }

  const tmpDir = getTmpUploadsDir(uploadId);
  await fs.mkdir(tmpDir, { recursive: true });
  const partPath = path.join(tmpDir, `part_${partNo}`);
  await fs.writeFile(partPath, buffer);

  const now = Date.now();
  await db.insert(mediaUploadParts).values({
    uploadId,
    partNo,
    sizeBytes,
    sha256,
    tempPath: partPath,
    receivedAt: now,
  });

  // Calculate sum of received parts
  const allParts = await db.query.mediaUploadParts.findMany({
    where: eq(mediaUploadParts.uploadId, uploadId),
  });
  const totalReceived = allParts.reduce((acc, p) => acc + p.sizeBytes, 0);

  await db
    .update(mediaUploads)
    .set({
      receivedBytes: totalReceived,
      status: 'UPLOADING',
      updatedAt: now,
    })
    .where(eq(mediaUploads.id, uploadId));

  await db
    .update(mediaFiles)
    .set({ status: 'UPLOADING', updatedAt: now })
    .where(eq(mediaFiles.id, upload.mediaId));

  return {
    uploadId,
    partNo,
    sizeBytes,
    sha256,
    receivedBytes: totalReceived,
  };
}

export async function getUploadSessionState(db: Database, uploadId: string) {
  const upload = await db.query.mediaUploads.findFirst({
    where: eq(mediaUploads.id, uploadId),
  });

  if (!upload) {
    throw new AppError('NOT_FOUND', '上传会话不存在', 404);
  }

  const parts = await db.query.mediaUploadParts.findMany({
    where: eq(mediaUploadParts.uploadId, uploadId),
  });

  const completedParts = parts.map((p) => p.partNo).sort((a, b) => a - b);

  return {
    uploadId: upload.id,
    mediaId: upload.mediaId,
    expectedSize: upload.expectedSize,
    receivedBytes: upload.receivedBytes,
    chunkSize: upload.chunkSize,
    completedParts,
    status: upload.status as 'INIT' | 'UPLOADING' | 'COMPLETE' | 'EXPIRED',
  };
}

export async function assembleCompletedUpload(db: Database, uploadId: string, finalSha256?: string) {
  const upload = await db.query.mediaUploads.findFirst({
    where: eq(mediaUploads.id, uploadId),
  });

  if (!upload) {
    throw new AppError('NOT_FOUND', '上传会话不存在', 404);
  }

  const parts = await db.query.mediaUploadParts.findMany({
    where: eq(mediaUploadParts.uploadId, uploadId),
  });

  parts.sort((a, b) => a.partNo - b.partNo);
  const hasGap = parts.some((part, index) => part.partNo !== index + 1);
  if (parts.length === 0 || hasGap) {
    throw new AppError('VALIDATION_ERROR', '上傳分塊不完整，請先補齊缺少的部分', 400);
  }

  const totalBytes = parts.reduce((sum, p) => sum + p.sizeBytes, 0);
  if (totalBytes !== upload.expectedSize) {
    throw new AppError(
      'VALIDATION_ERROR',
      `上传大小不符合预期 (实际: ${totalBytes}, 预期: ${upload.expectedSize})`,
      400,
    );
  }

  // Combine part files into single assembled buffer/file
  const tmpDir = getTmpUploadsDir(uploadId);
  const assembledPath = path.join(tmpDir, 'assembled.bin');

  const fileHandle = await fs.open(assembledPath, 'w');
  const hasher = crypto.createHash('sha256');

  try {
    for (const part of parts) {
      const partBuffer = await fs.readFile(part.tempPath);
      hasher.update(partBuffer);
      await fileHandle.write(partBuffer);
    }
  } finally {
    await fileHandle.close();
  }

  const computedHash = hasher.digest('hex');

  // Check expectedSha256 if provided
  const targetSha256 = finalSha256 || upload.expectedSha256;
  if (targetSha256 && targetSha256.toLowerCase() !== computedHash.toLowerCase()) {
    throw new AppError(
      'VALIDATION_ERROR',
      `文件完整性校验失败 (期望: ${targetSha256}, 实际: ${computedHash})`,
      400,
    );
  }

  const now = Date.now();
  await db
    .update(mediaUploads)
    .set({
      status: 'COMPLETE',
      receivedBytes: totalBytes,
      updatedAt: now,
    })
    .where(eq(mediaUploads.id, uploadId));

  await db
    .update(mediaFiles)
    .set({
      status: 'PROCESSING',
      sha256: computedHash,
      sizeBytes: totalBytes,
      updatedAt: now,
    })
    .where(eq(mediaFiles.id, upload.mediaId));

  return {
    mediaId: upload.mediaId,
    assembledPath,
    sha256: computedHash,
    sizeBytes: totalBytes,
  };
}
