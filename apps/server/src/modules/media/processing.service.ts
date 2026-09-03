import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { mediaFiles } from '@runew/db';
import {
  assertSupportedMediaDeclaration,
  getMediaStorageDir,
  getTmpUploadsDir,
  normalizeUploadMimeType,
} from './upload.service.js';
import { AppError } from '../../lib/errors.js';
import type { Database } from '../../plugins/db.js';

const DISPLAY_MAX_EDGE = 1600;
const THUMBNAIL_MAX_EDGE = 400;

export function getMimeExtension(mimeType: string): string {
  const normalizedMime = mimeType.toLowerCase().split(';', 1)[0];
  switch (normalizedMime) {
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
    case 'audio/webm':
      return 'webm';
    case 'video/mp4':
      return 'mp4';
    case 'video/webm':
      return 'webm';
    case 'video/quicktime':
      return 'mov';
    case 'audio/mp3':
    case 'audio/mpeg':
      return 'mp3';
    default:
      return 'bin';
  }
}

export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const normalizedMime = normalizeUploadMimeType(mimeType);
  if (normalizedMime.startsWith('image/jpeg')) {
    return (
      buffer.length >= 3 &&
      buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    );
  }
  if (normalizedMime.startsWith('image/png')) {
    return (
      buffer.length >= 8 &&
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  if (normalizedMime.startsWith('image/webp')) {
    return (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  if (
    normalizedMime.startsWith('audio/ogg') ||
    normalizedMime.startsWith('audio/opus')
  ) {
    return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS';
  }
  if (normalizedMime.startsWith('audio/aac')) {
    return buffer.length >= 2 && buffer[0] === 0xff && (buffer[1]! & 0xf6) === 0xf0;
  }
  if (
    normalizedMime.startsWith('audio/mp4') ||
    normalizedMime.startsWith('audio/m4a')
  ) {
    return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
  }
  if (normalizedMime.startsWith('audio/webm')) {
    return (
      buffer.length >= 4 &&
      buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    );
  }
  if (
    normalizedMime.startsWith('video/mp4') ||
    normalizedMime.startsWith('video/quicktime')
  ) {
    return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
  }
  if (normalizedMime.startsWith('video/webm')) {
    return (
      buffer.length >= 4 &&
      buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    );
  }
  return true;
}

function normalizeImage(
  pipeline: ReturnType<typeof sharp>,
  mimeType: string,
): ReturnType<typeof sharp> {
  const normalizedMime = normalizeUploadMimeType(mimeType);
  if (normalizedMime === 'image/png') return pipeline.png({ compressionLevel: 8 });
  if (normalizedMime === 'image/webp') return pipeline.webp({ quality: 80 });
  return pipeline.jpeg({ quality: 82, mozjpeg: true });
}

function readUInt64LE(buffer: Buffer, offset: number): number {
  const value = buffer.readBigUInt64LE(offset);
  return Number(value);
}

function readUInt64BE(buffer: Buffer, offset: number): number {
  const value = buffer.readBigUInt64BE(offset);
  return Number(value);
}

function parseAacDuration(buffer: Buffer): number | null {
  const sampleRates = [
    96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000,
  ];
  let offset = 0;
  let frames = 0;
  let sampleRate = 0;
  while (offset + 7 <= buffer.length) {
    if (buffer[offset] !== 0xff || (buffer[offset + 1]! & 0xf6) !== 0xf0) {
      offset += 1;
      continue;
    }
    const sampleRateIndex = (buffer[offset + 2]! >> 2) & 0x0f;
    const frameLength =
      ((buffer[offset + 3]! & 0x03) << 11) |
      (buffer[offset + 4]! << 3) |
      ((buffer[offset + 5]! >> 5) & 0x07);
    sampleRate = sampleRates[sampleRateIndex] ?? 0;
    if (!sampleRate || frameLength < 7 || offset + frameLength > buffer.length) break;
    frames += 1;
    offset += frameLength;
  }
  return frames > 0 && sampleRate > 0
    ? Math.round((frames * 1024 * 1000) / sampleRate)
    : null;
}

function parseOggOpusDuration(buffer: Buffer): number | null {
  const opusHeadOffset = buffer.indexOf(Buffer.from('OpusHead'));
  if (opusHeadOffset < 0 || opusHeadOffset + 19 > buffer.length) return null;
  const preSkip = buffer.readUInt16LE(opusHeadOffset + 10);
  let lastGranule = 0;
  let offset = 0;
  while (offset + 27 <= buffer.length) {
    const pageOffset = buffer.indexOf(Buffer.from('OggS'), offset);
    if (pageOffset < 0 || pageOffset + 27 > buffer.length) break;
    const segmentCount = buffer[pageOffset + 26]!;
    const tableEnd = pageOffset + 27 + segmentCount;
    if (tableEnd > buffer.length) break;
    const pageSize = buffer
      .subarray(pageOffset + 27, tableEnd)
      .reduce((sum, value) => sum + value, 0);
    if (pageOffset + 27 + segmentCount + pageSize > buffer.length) break;
    lastGranule = readUInt64LE(buffer, pageOffset + 6);
    offset = pageOffset + 27 + segmentCount + pageSize;
  }
  return lastGranule > preSkip
    ? Math.round(((lastGranule - preSkip) * 1000) / 48000)
    : null;
}

function parseMp4Duration(buffer: Buffer): number | null {
  const mdhdOffset = buffer.indexOf(Buffer.from('mdhd'));
  if (mdhdOffset < 0 || mdhdOffset + 24 > buffer.length) return null;
  const version = buffer[mdhdOffset + 4];
  if (version === 0) {
    const timeScale = buffer.readUInt32BE(mdhdOffset + 16);
    const duration = buffer.readUInt32BE(mdhdOffset + 20);
    return timeScale > 0 ? Math.round((duration * 1000) / timeScale) : null;
  }
  if (version === 1 && mdhdOffset + 40 <= buffer.length) {
    const timeScale = buffer.readUInt32BE(mdhdOffset + 28);
    const duration = readUInt64BE(buffer, mdhdOffset + 32);
    return timeScale > 0 ? Math.round((duration * 1000) / timeScale) : null;
  }
  return null;
}

function readEbmlVint(buffer: Buffer, offset: number) {
  if (offset >= buffer.length) return null;
  const first = buffer[offset]!;
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > buffer.length) return null;
  let value = first & (mask - 1);
  for (let index = 1; index < length; index += 1)
    value = value * 256 + buffer[offset + index]!;
  return { value, length, unknown: value === 2 ** (7 * length) - 1 };
}

function parseWebmDuration(buffer: Buffer): number | null {
  const infoId = Buffer.from([0x15, 0x49, 0xa9, 0x66]);
  const durationId = Buffer.from([0x44, 0x89]);
  const timecodeScaleId = Buffer.from([0x2a, 0xd7, 0xb1]);
  const infoOffset = buffer.indexOf(infoId);
  if (infoOffset < 0) return null;
  const infoSize = readEbmlVint(buffer, infoOffset + infoId.length);
  if (!infoSize || infoSize.unknown) return null;
  const infoStart = infoOffset + infoId.length + infoSize.length;
  const infoEnd = Math.min(buffer.length, infoStart + infoSize.value);
  let timecodeScale = 1_000_000;
  let duration: number | null = null;
  let offset = infoStart;
  while (offset < infoEnd) {
    const idLength =
      buffer[offset] !== undefined
        ? (() => {
            const first = buffer[offset]!;
            let mask = 0x80;
            let length = 1;
            while (length <= 4 && (first & mask) === 0) {
              mask >>= 1;
              length += 1;
            }
            return length;
          })()
        : 0;
    if (!idLength || offset + idLength > infoEnd) break;
    const size = readEbmlVint(buffer, offset + idLength);
    if (!size || size.unknown) break;
    const dataStart = offset + idLength + size.length;
    const dataEnd = Math.min(infoEnd, dataStart + size.value);
    if (
      buffer.subarray(offset, offset + idLength).equals(timecodeScaleId) &&
      size.value <= 8
    ) {
      let value = 0;
      for (const byte of buffer.subarray(dataStart, dataEnd))
        value = value * 256 + byte;
      if (value > 0) timecodeScale = value;
    } else if (
      buffer.subarray(offset, offset + idLength).equals(durationId) &&
      (size.value === 4 || size.value === 8)
    ) {
      duration =
        size.value === 4
          ? buffer.readFloatBE(dataStart)
          : buffer.readDoubleBE(dataStart);
    }
    offset = dataEnd;
  }
  return duration !== null && Number.isFinite(duration) && duration > 0
    ? Math.round((duration * timecodeScale) / 1_000_000)
    : null;
}

async function readAudioMetadata(filePath: string, mimeType: string) {
  const buffer = await fs.readFile(filePath);
  const normalizedMime = normalizeUploadMimeType(mimeType);
  const durationMs = normalizedMime.startsWith('audio/aac')
    ? parseAacDuration(buffer)
    : normalizedMime.startsWith('audio/ogg') || normalizedMime.startsWith('audio/opus')
      ? parseOggOpusDuration(buffer)
      : normalizedMime.startsWith('audio/webm')
        ? parseWebmDuration(buffer)
        : normalizedMime.startsWith('audio/mp4') ||
            normalizedMime.startsWith('audio/m4a')
          ? parseMp4Duration(buffer)
          : null;
  if (
    !durationMs &&
    (normalizedMime.startsWith('audio/aac') ||
      normalizedMime.startsWith('audio/opus') ||
      normalizedMime.startsWith('audio/ogg') ||
      normalizedMime.startsWith('audio/webm'))
  ) {
    throw new Error('音频无法读取有效时长');
  }
  return { durationMs };
}

function resolveStoredPath(storageKey: string) {
  const root = path.resolve(getMediaStorageDir());
  const candidate = path.resolve(root, storageKey);
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new AppError('VALIDATION_ERROR', '媒体存储路径不安全', 400);
  }
  return candidate;
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
  assertSupportedMediaDeclaration(
    media.mediaType as Parameters<typeof assertSupportedMediaDeclaration>[0],
    media.mimeType,
  );

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
  const originalStorageKey = path
    .relative(getMediaStorageDir(), originalPath)
    .replace(/\\/g, '/');
  const originalTempPath = `${originalPath}.uploading`;

  try {
    if (path.resolve(assembledPath) !== path.resolve(originalPath)) {
      await fs.copyFile(assembledPath, originalTempPath);
      await fs.rename(originalTempPath, originalPath);
    }

    const header = await fs
      .readFile(originalPath)
      .then((value) => value.subarray(0, 16));
    if (!validateMagicBytes(header, media.mimeType)) {
      throw new Error('媒體檔案內容與宣告格式不一致');
    }

    let storageKey = originalStorageKey;
    let thumbnailStorageKey: string | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let durationMs: number | null = null;

    if (media.mediaType === 'IMAGE') {
      const metadata = await sharp(originalPath, { failOn: 'error' }).metadata();
      if (!metadata.width || !metadata.height || !metadata.format) {
        throw new Error('圖片無法完整解碼');
      }
      width = metadata.width;
      height = metadata.height;

      const displayPath = path.join(
        baseStorageDir,
        `disp_${media.id}_${suffix}.${ext}`,
      );
      const thumbnailPath = path.join(
        baseStorageDir,
        `thumb_${media.id}_${suffix}.${ext}`,
      );
      await atomicWriteImage(
        originalPath,
        displayPath,
        media.mimeType,
        DISPLAY_MAX_EDGE,
      );
      await atomicWriteImage(
        originalPath,
        thumbnailPath,
        media.mimeType,
        THUMBNAIL_MAX_EDGE,
      );
      storageKey = path.relative(getMediaStorageDir(), displayPath).replace(/\\/g, '/');
      thumbnailStorageKey = path
        .relative(getMediaStorageDir(), thumbnailPath)
        .replace(/\\/g, '/');
    } else if (media.mediaType === 'AUDIO') {
      ({ durationMs } = await readAudioMetadata(originalPath, media.mimeType));
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
        durationMs,
        updatedAt: now,
        version: media.version + 1,
      })
      .where(eq(mediaFiles.id, mediaId));

    await fs.rm(getTmpUploadsDir(uploadId), { recursive: true, force: true });
    return { mediaId, status: 'READY' as const };
  } catch {
    await fs.rm(originalTempPath, { force: true }).catch(() => undefined);
    const originalExists = await fs
      .stat(originalPath)
      .then(() => true)
      .catch(() => false);
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

export async function retryFailedMediaProcessing(db: Database, mediaId: string) {
  const media = await db.query.mediaFiles.findFirst({
    where: eq(mediaFiles.id, mediaId),
  });
  if (!media) throw new AppError('NOT_FOUND', '媒体记录不存在', 404);
  if (media.status === 'READY') return { mediaId, status: 'READY' as const };
  if (!media.originalStorageKey) {
    throw new AppError(
      'MEDIA_PROCESSING_FAILED',
      '原件不存在，暂时无法重试处理',
      422,
      true,
    );
  }
  const originalPath = resolveStoredPath(media.originalStorageKey);
  const stat = await fs.stat(originalPath).catch(() => null);
  if (!stat)
    throw new AppError(
      'MEDIA_PROCESSING_FAILED',
      '原件文件不存在，暂时无法重试处理',
      422,
      true,
    );
  await db
    .update(mediaFiles)
    .set({ status: 'PROCESSING', updatedAt: Date.now() })
    .where(eq(mediaFiles.id, mediaId));
  const hash =
    media.sha256 ??
    crypto
      .createHash('sha256')
      .update(await fs.readFile(originalPath))
      .digest('hex');
  return processCompletedMedia(
    db,
    mediaId,
    `retry_${mediaId}`,
    originalPath,
    hash,
    stat.size,
  );
}
