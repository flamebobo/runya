import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { mediaFiles } from '@runew/db';
import { getMediaStorageDir } from './upload.service.js';
import { AppError } from '../../lib/errors.js';
import type { Database } from '../../plugins/db.js';

export async function checkMediaAccessPermission(
  db: Database,
  userId: string,
  mediaId: string,
) {
  const media = await db.query.mediaFiles.findFirst({
    where: eq(mediaFiles.id, mediaId),
  });

  if (!media || media.status === 'DELETED') {
    throw new AppError('NOT_FOUND', '媒体文件不存在', 404);
  }

  // Check if user belongs to family
  const membership = await db.query.familyMembers.findFirst({
    where: (fm, { and, eq }) =>
      and(
        eq(fm.familyId, media.familyId),
        eq(fm.userId, userId),
        eq(fm.status, 'ACTIVE'),
      ),
  });

  if (!membership) {
    throw new AppError('FAMILY_ACCESS_DENIED', '无权访问此小家媒体资源', 403);
  }

  const sealedCapsuleLink = await db.query.timeCapsuleMedia.findFirst({
    where: (link, { eq }) => eq(link.mediaId, mediaId),
  });
  if (sealedCapsuleLink) {
    const capsule = await db.query.timeCapsules.findFirst({
      where: (timeCapsule, { and, eq, isNull }) =>
        and(
          eq(timeCapsule.id, sealedCapsuleLink.timeCapsuleId),
          isNull(timeCapsule.deletedAt),
        ),
    });
    if (capsule?.state === 'SEALED') {
      throw new AppError('CAPSULE_SEALED', '时光胶囊尚未到开启时间', 403);
    }
  }

  return media;
}

export async function getMediaFilePath(key: string): Promise<string> {
  const fullPath = path.resolve(getMediaStorageDir(), key);
  const rootMediaDir = path.resolve(getMediaStorageDir());

  const relativePath = path.relative(rootMediaDir, fullPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new AppError('PERMISSION_DENIED', '非法的媒体存储路径', 403);
  }

  try {
    await fs.access(fullPath);
    return fullPath;
  } catch {
    throw new AppError('NOT_FOUND', '实体存储文件已被移除', 404);
  }
}
