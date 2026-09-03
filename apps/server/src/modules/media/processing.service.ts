import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { mediaFiles } from '@runew/db';
import { getMediaStorageDir, getTmpUploadsDir } from './upload.service.js';
import { AppError } from '../../lib/errors.js';
import type { Database } from '../../plugins/db.js';

const DISPLAY_MAX_EDGE = 1600;
const THUMBNAIL_MAX_EDGE = 400;

export function getMimeExtension(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'audio/aac':
    case 'audio/mp4':
    case 'audio/m4a':
      return 'm4a';
    case 'audio/opus':
    case 'audio/ogg':
      return 'ogg';
    case 'audio/mp3':
    case 'audio/mpeg':
      return 'mp3';
    default:
      return 'bin';
  }
}

export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const normalizedMime = mimeType.toLowerCase();
  if (normalizedMime.startsWith('image/jpeg')) {
    return buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  }
  if (normalizedMime.startsWith('image/png')) {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (normalizedMime.startsWith('image/webp')) {
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  if (normalizedMime.startsWith('audio/ogg') || normalizedMime.startsWith('audio/opus')) {
    return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS';
  }
  return true;
}

function normalizeImage(pipeline: sharp.Sharp, mimeType: string): sharp.Sharp {
  if (mimeType === 'image/png') return pipeline.png({ compressionLevel: 8 });
  if (mimeType === 'image/webp') return pipeline.webp({ quality: 80 });
  return pipeline.jpeg({ quality: 82, mozjpeg: true });
}

async function atomicWriteImage(
  sourcePath: string,
  destinationPath: string,
  mimeType: string,
  maxEdge: number,
): Promise<void> {
  const tempPath = `${destinationPath}.processing`;
  await normalizeImage(
    sharp(sourcePath, { failOn: 'error' }).rotate().resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    }),
    mimeType,
  ).toFile(tempPath);
  await fs.rename(tempPath, destinationPath);
}

export async function processCompletedMedia(
  db: Database,
  mediaId: string,
  uploadId: string,
  assembledPath: string,
  sha256: string,
  sizeBytes: number,
) {
  const media = await db.query.mediaFiles.findFirst({
    where: eq(mediaFiles.id, mediaId),
  });
  if (!media) {
    throw new AppError('NOT_FOUND', '媒體記錄不存在', 404);
  }

  const createdAt = new Date(media.createdAt);
  const baseStorageDir = path.join(
    getMediaStorageDir(),
    'storage',
    media.familyId,
    createdAt.getUTCFullYear().toString(),
    (createdAt.getUTCMonth() + 1).toString().padStart(2, '0'),
  );
  await fs.mkdir(baseStorageDir, { recursive: true });

  const ext = getMimeExtension(media.mimeType);
  const suffix = sha256.substring(0, 8);
  const originalPath = path.join(baseStorageDir, `orig_${media.id}_${suffix}.${ext}`);
  const originalStorageKey = path.relative(getMediaStorageDir(), originalPath).replace(/\\/g, '/');
  const originalTempPath = `${originalPath}.uploading`;

  try {
    await fs.copyFile(assembledPath, originalTempPath);
    await fs.rename(originalTempPath, originalPath);

    const header = await fs.readFile(originalPath).then((value) => value.subarray(0, 16));
    if (!validateMagicBytes(header, media.mimeType)) {
      throw new Error('媒體檔案內容與宣告格式不一致');
    }

    let storageKey = originalStorageKey;
    let thumbnailStorageKey = originalStorageKey;
    let width: number | null = null;
    let height: number | null = null;

    if (media.mediaType === 'IMAGE') {
      const metadata = await sharp(originalPath, { failOn: 'error' }).metadata();
      if (!metadata.width || !metadata.height || !metadata.format) {
        throw new Error('圖片無法完整解碼');
      }
      width = metadata.width;
      height = metadata.height;

      const displayPath = path.join(baseStorageDir, `disp_${media.id}_${suffix}.${ext}`);
      const thumbnailPath = path.join(baseStorageDir, `thumb_${media.id}_${suffix}.${ext}`);
      await atomicWriteImage(originalPath, displayPath, media.mimeType, DISPLAY_MAX_EDGE);
      await atomicWriteImage(originalPath, thumbnailPath, media.mimeType, THUMBNAIL_MAX_EDGE);
      storageKey = path.relative(getMediaStorageDir(), displayPath).replace(/\\/g, '/');
      thumbnailStorageKey = path.relative(getMediaStorageDir(), thumbnailPath).replace(/\\/g, '/');
    }

    const now = Date.now();
    await db
      .update(mediaFiles)
      .set({
        status: 'READY',
        storageKey,
        originalStorageKey,
        thumbnailStorageKey,
        sha256,
        sizeBytes,
        width,
        height,
        updatedAt: now,
        version: media.version + 1,
      })
      .where(eq(mediaFiles.id, mediaId));

    await fs.rm(getTmpUploadsDir(uploadId), { recursive: true, force: true });
    return { mediaId, status: 'READY' as const };
  } catch (error) {
    await fs.rm(originalTempPath, { force: true }).catch(() => undefined);
    const originalExists = await fs.stat(originalPath).then(() => true).catch(() => false);
    await db
      .update(mediaFiles)
      .set({
        status: 'FAILED',
        originalStorageKey: originalExists ? originalStorageKey : null,
        updatedAt: Date.now(),
        version: media.version + 1,
      })
      .where(eq(mediaFiles.id, mediaId));

    throw new AppError(
      'MEDIA_PROCESSING_FAILED',
      '媒體已安全保留，但處理尚未完成，稍後可以重試',
      422,
      true,
    );
  }
}
