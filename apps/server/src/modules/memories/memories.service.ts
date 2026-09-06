import { and, desc, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import {
  audioMemories,
  babyQuotes,
  babies,
  firstMomentMedia,
  firstMoments,
  mediaFiles,
  photoMemories,
  photoMemoryMedia,
  timeCapsuleMedia,
  timeCapsules,
} from '@runew/db';
import {
  type AnnualReviewResponse,
  type CreateAudioMemoryBody,
  type CreateBabyQuoteBody,
  type CreateFirstMomentBody,
  type CreatePhotoMemoryBody,
  type CreateTimeCapsuleBody,
  type MediaPublic,
  type MemoriesFavorites,
  type UpdateAudioMemoryBody,
  type UpdateBabyQuoteBody,
  type UpdateFirstMomentBody,
  type UpdatePhotoMemoryBody,
  type UpdateTimeCapsuleBody,
  type UpdateTimeCapsuleFavoriteBody,
  audioCategorySchema,
  capsuleStateSchema,
  mediaPublicSchema,
} from '@runew/contracts';
import { createUlid } from '@runew/shared-utils';
import { AppError } from '../../lib/errors.js';
import type { Database } from '../../plugins/db.js';
import { restoreTrashItem } from '../m11/service.js';

type MediaKind = 'IMAGE' | 'AUDIO' | 'VIDEO' | 'FILE';

function mapMediaPublic(media: typeof mediaFiles.$inferSelect): MediaPublic {
  return mediaPublicSchema.parse({
    id: media.id,
    familyId: media.familyId,
    babyId: media.babyId,
    ownerUserId: media.ownerUserId,
    mediaType: media.mediaType as MediaKind,
    status: media.status,
    mimeType: media.mimeType,
    originalFilename: media.originalFilename,
    sizeBytes: media.sizeBytes,
    width: media.width,
    height: media.height,
    durationMs: media.durationMs,
    waveformJson: media.waveformJson,
    createdAt: media.createdAt,
    updatedAt: media.updatedAt,
  });
}

async function assertBabyInFamily(db: Database, familyId: string, babyId: string) {
  const baby = await db.query.babies.findFirst({
    where: and(
      eq(babies.id, babyId),
      eq(babies.familyId, familyId),
      isNull(babies.deletedAt),
    ),
  });
  if (!baby) throw new AppError('FAMILY_ACCESS_DENIED', '无权访问这个宝宝的回忆', 403);
  return baby;
}

async function validateMediaIds(
  db: Database,
  familyId: string,
  mediaIds: string[] | undefined,
  babyId?: string,
  expectedType?: MediaKind,
) {
  if (!mediaIds?.length) return [];

  const uniqueIds = [...new Set(mediaIds)];
  if (uniqueIds.length !== mediaIds.length) {
    throw new AppError('VALIDATION_ERROR', '同一份媒体不能重复添加', 400);
  }
  const records = await db.query.mediaFiles.findMany({
    where: and(inArray(mediaFiles.id, uniqueIds), eq(mediaFiles.familyId, familyId)),
  });
  if (records.length !== uniqueIds.length) {
    throw new AppError('FAMILY_ACCESS_DENIED', '媒体不属于当前家庭', 403);
  }
  for (const media of records) {
    if (media.deletedAt || media.status === 'DELETED') {
      throw new AppError('GONE', '媒体已被删除，不能继续关联', 410);
    }
    if (expectedType && media.mediaType !== expectedType) {
      throw new AppError('VALIDATION_ERROR', '媒体类型与回忆类型不匹配', 400);
    }
    if (babyId && media.babyId && media.babyId !== babyId) {
      throw new AppError('FAMILY_ACCESS_DENIED', '媒体不属于当前宝宝', 403);
    }
  }
  return records;
}

async function getLinkedMedia(
  db: Database,
  familyId: string,
  linkRows: Array<{ mediaId: string }>,
) {
  const mediaIds = linkRows.map((link) => link.mediaId);
  if (!mediaIds.length) return [] as MediaPublic[];
  const records = await db.query.mediaFiles.findMany({
    where: and(inArray(mediaFiles.id, mediaIds), eq(mediaFiles.familyId, familyId)),
  });
  const mediaById = new Map(records.map((media) => [media.id, mapMediaPublic(media)]));
  return mediaIds.flatMap((mediaId) => {
    const media = mediaById.get(mediaId);
    return media ? [media] : [];
  });
}

// --- Photos ---
export async function createPhotoMemory(
  db: Database,
  actorUserId: string,
  familyId: string,
  babyId: string,
  body: CreatePhotoMemoryBody,
) {
  await assertBabyInFamily(db, familyId, babyId);
  await validateMediaIds(db, familyId, body.mediaIds, babyId, 'IMAGE');
  const now = Date.now();
  const id = createUlid();
  await db.insert(photoMemories).values({
    id,
    familyId,
    babyId,
    title: body.title,
    story: body.story ?? null,
    happenedAt: body.happenedAt,
    timezoneName: body.timezoneName ?? 'Asia/Shanghai',
    favorite: body.favorite ?? false,
    createdBy: actorUserId,
    createdAt: now,
    updatedBy: actorUserId,
    updatedAt: now,
    version: 1,
  });
  if (body.mediaIds?.length) {
    await db.insert(photoMemoryMedia).values(
      body.mediaIds.map((mediaId, sortOrder) => ({
        photoMemoryId: id,
        mediaId,
        sortOrder,
      })),
    );
  }
  return getPhotoMemoryById(db, familyId, id);
}

export async function getPhotoMemoryById(db: Database, familyId: string, id: string) {
  const unscopedPhoto = await db.query.photoMemories.findFirst({
    where: and(eq(photoMemories.id, id), isNull(photoMemories.deletedAt)),
  });
  if (unscopedPhoto && unscopedPhoto.familyId !== familyId) {
    throw new AppError('FAMILY_ACCESS_DENIED', '无权访问这个家庭的照片回忆', 403);
  }
  const photo = await db.query.photoMemories.findFirst({
    where: and(
      eq(photoMemories.id, id),
      eq(photoMemories.familyId, familyId),
      isNull(photoMemories.deletedAt),
    ),
  });
  if (!photo) throw new AppError('NOT_FOUND', '照片回忆不存在', 404);
  const links = await db.query.photoMemoryMedia.findMany({
    where: eq(photoMemoryMedia.photoMemoryId, id),
    orderBy: [photoMemoryMedia.sortOrder],
  });
  return { ...photo, media: await getLinkedMedia(db, familyId, links) };
}

export async function listPhotoMemories(
  db: Database,
  familyId: string,
  babyId: string,
) {
  await assertBabyInFamily(db, familyId, babyId);
  const photos = await db.query.photoMemories.findMany({
    where: and(
      eq(photoMemories.familyId, familyId),
      eq(photoMemories.babyId, babyId),
      isNull(photoMemories.deletedAt),
    ),
    orderBy: [desc(photoMemories.happenedAt), desc(photoMemories.createdAt)],
  });
  return Promise.all(photos.map((photo) => getPhotoMemoryById(db, familyId, photo.id)));
}

export async function updatePhotoMemory(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
  body: UpdatePhotoMemoryBody,
) {
  const photo = await getPhotoMemoryById(db, familyId, id);
  await validateMediaIds(db, familyId, body.mediaIds, photo.babyId, 'IMAGE');
  await db
    .update(photoMemories)
    .set({
      title: body.title ?? photo.title,
      story: body.story !== undefined ? body.story : photo.story,
      happenedAt: body.happenedAt ?? photo.happenedAt,
      timezoneName: body.timezoneName ?? photo.timezoneName,
      favorite: body.favorite !== undefined ? body.favorite : photo.favorite,
      updatedBy: actorUserId,
      updatedAt: Date.now(),
      version: photo.version + 1,
    })
    .where(and(eq(photoMemories.id, id), eq(photoMemories.familyId, familyId)));
  if (body.mediaIds !== undefined) {
    await db.delete(photoMemoryMedia).where(eq(photoMemoryMedia.photoMemoryId, id));
    if (body.mediaIds.length) {
      await db.insert(photoMemoryMedia).values(
        body.mediaIds.map((mediaId, sortOrder) => ({
          photoMemoryId: id,
          mediaId,
          sortOrder,
        })),
      );
    }
  }
  return getPhotoMemoryById(db, familyId, id);
}

export async function deletePhotoMemory(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
) {
  const photo = await getPhotoMemoryById(db, familyId, id);
  const now = Date.now();
  await db
    .update(photoMemories)
    .set({
      deletedAt: now,
      updatedBy: actorUserId,
      updatedAt: now,
      version: photo.version + 1,
    })
    .where(and(eq(photoMemories.id, id), eq(photoMemories.familyId, familyId)));
}

export async function restorePhotoMemory(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
  deviceId: string | null = null,
) {
  const deleted = await db.query.photoMemories.findFirst({
    where: and(
      eq(photoMemories.id, id),
      eq(photoMemories.familyId, familyId),
      isNotNull(photoMemories.deletedAt),
    ),
  });
  if (!deleted) throw new AppError('NOT_FOUND', '找不到可恢复的照片回忆', 404);
  await restoreTrashItem(db, actorUserId, familyId, 'PHOTO_MEMORY', id, deviceId);
  return getPhotoMemoryById(db, familyId, id);
}

// --- Baby Quotes ---
export async function createBabyQuote(
  db: Database,
  actorUserId: string,
  familyId: string,
  babyId: string,
  body: CreateBabyQuoteBody,
) {
  await assertBabyInFamily(db, familyId, babyId);
  await validateMediaIds(
    db,
    familyId,
    body.audioMediaId ? [body.audioMediaId] : undefined,
    babyId,
    'AUDIO',
  );
  const now = Date.now();
  const id = createUlid();
  await db.insert(babyQuotes).values({
    id,
    familyId,
    babyId,
    quoteText: body.quoteText,
    audioMediaId: body.audioMediaId ?? null,
    happenedAt: body.happenedAt,
    timezoneName: body.timezoneName ?? 'Asia/Shanghai',
    favorite: body.favorite ?? false,
    createdBy: actorUserId,
    createdAt: now,
    updatedBy: actorUserId,
    updatedAt: now,
    version: 1,
  });
  return getBabyQuoteById(db, familyId, id);
}

export async function getBabyQuoteById(db: Database, familyId: string, id: string) {
  const unscopedQuote = await db.query.babyQuotes.findFirst({
    where: and(eq(babyQuotes.id, id), isNull(babyQuotes.deletedAt)),
  });
  if (unscopedQuote && unscopedQuote.familyId !== familyId) {
    throw new AppError('FAMILY_ACCESS_DENIED', '无权访问这个家庭的宝宝语录', 403);
  }
  const quote = await db.query.babyQuotes.findFirst({
    where: and(
      eq(babyQuotes.id, id),
      eq(babyQuotes.familyId, familyId),
      isNull(babyQuotes.deletedAt),
    ),
  });
  if (!quote) throw new AppError('NOT_FOUND', '宝宝语录不存在', 404);
  let audioMedia: MediaPublic | null = null;
  if (quote.audioMediaId) {
    const media = await db.query.mediaFiles.findFirst({
      where: and(
        eq(mediaFiles.id, quote.audioMediaId),
        eq(mediaFiles.familyId, familyId),
      ),
    });
    if (media && !media.deletedAt && media.status !== 'DELETED')
      audioMedia = mapMediaPublic(media);
  }
  return { ...quote, audioMedia };
}

export async function listBabyQuotes(db: Database, familyId: string, babyId: string) {
  await assertBabyInFamily(db, familyId, babyId);
  const quotes = await db.query.babyQuotes.findMany({
    where: and(
      eq(babyQuotes.familyId, familyId),
      eq(babyQuotes.babyId, babyId),
      isNull(babyQuotes.deletedAt),
    ),
    orderBy: [desc(babyQuotes.happenedAt), desc(babyQuotes.createdAt)],
  });
  return Promise.all(quotes.map((quote) => getBabyQuoteById(db, familyId, quote.id)));
}

export async function updateBabyQuote(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
  body: UpdateBabyQuoteBody,
  expectedVersion: number | null,
) {
  const quote = await getBabyQuoteById(db, familyId, id);
  if (expectedVersion === null) {
    throw new AppError('VALIDATION_ERROR', '更新语录需要 If-Match', 400);
  }
  if (expectedVersion !== quote.version) {
    throw new AppError('ENTITY_VERSION_CONFLICT', '这条宝宝语录已在别处更新', 409);
  }
  await validateMediaIds(
    db,
    familyId,
    body.audioMediaId ? [body.audioMediaId] : undefined,
    quote.babyId,
    'AUDIO',
  );
  const result = await db
    .update(babyQuotes)
    .set({
      quoteText: body.quoteText ?? quote.quoteText,
      audioMediaId:
        body.audioMediaId !== undefined ? body.audioMediaId : quote.audioMediaId,
      happenedAt: body.happenedAt ?? quote.happenedAt,
      timezoneName: body.timezoneName ?? quote.timezoneName,
      favorite: body.favorite !== undefined ? body.favorite : quote.favorite,
      updatedBy: actorUserId,
      updatedAt: Date.now(),
      version: quote.version + 1,
    })
    .where(
      and(
        eq(babyQuotes.id, id),
        eq(babyQuotes.familyId, familyId),
        eq(babyQuotes.version, expectedVersion),
      ),
    );
  if (result.rowsAffected !== 1) {
    throw new AppError('ENTITY_VERSION_CONFLICT', '这条宝宝语录已在别处更新', 409);
  }
  return getBabyQuoteById(db, familyId, id);
}

export async function deleteBabyQuote(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
) {
  const quote = await getBabyQuoteById(db, familyId, id);
  const now = Date.now();
  await db
    .update(babyQuotes)
    .set({
      deletedAt: now,
      updatedBy: actorUserId,
      updatedAt: now,
      version: quote.version + 1,
    })
    .where(and(eq(babyQuotes.id, id), eq(babyQuotes.familyId, familyId)));
}

export async function restoreBabyQuote(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
  deviceId: string | null = null,
) {
  const deleted = await db.query.babyQuotes.findFirst({
    where: and(
      eq(babyQuotes.id, id),
      eq(babyQuotes.familyId, familyId),
      isNotNull(babyQuotes.deletedAt),
    ),
  });
  if (!deleted) throw new AppError('NOT_FOUND', '找不到可恢复的宝宝语录', 404);
  await restoreTrashItem(db, actorUserId, familyId, 'BABY_QUOTE', id, deviceId);
  return getBabyQuoteById(db, familyId, id);
}

// --- Audio Memories ---
export async function createAudioMemory(
  db: Database,
  actorUserId: string,
  familyId: string,
  babyId: string,
  body: CreateAudioMemoryBody,
) {
  await assertBabyInFamily(db, familyId, babyId);
  await validateMediaIds(db, familyId, [body.mediaId], babyId, 'AUDIO');
  const now = Date.now();
  const id = createUlid();
  await db.insert(audioMemories).values({
    id,
    familyId,
    babyId,
    mediaId: body.mediaId,
    title: body.title,
    category: body.category ?? 'OTHER',
    happenedAt: body.happenedAt,
    timezoneName: body.timezoneName ?? 'Asia/Shanghai',
    favorite: body.favorite ?? false,
    createdBy: actorUserId,
    createdAt: now,
    updatedBy: actorUserId,
    updatedAt: now,
    version: 1,
  });
  return getAudioMemoryById(db, familyId, id);
}

export async function getAudioMemoryById(db: Database, familyId: string, id: string) {
  const unscopedAudio = await db.query.audioMemories.findFirst({
    where: and(eq(audioMemories.id, id), isNull(audioMemories.deletedAt)),
  });
  if (unscopedAudio && unscopedAudio.familyId !== familyId) {
    throw new AppError('FAMILY_ACCESS_DENIED', '无权访问这个家庭的声音回忆', 403);
  }
  const audio = await db.query.audioMemories.findFirst({
    where: and(
      eq(audioMemories.id, id),
      eq(audioMemories.familyId, familyId),
      isNull(audioMemories.deletedAt),
    ),
  });
  if (!audio) throw new AppError('NOT_FOUND', '声音回忆不存在', 404);
  const media = await db.query.mediaFiles.findFirst({
    where: and(eq(mediaFiles.id, audio.mediaId), eq(mediaFiles.familyId, familyId)),
  });
  return {
    ...audio,
    category: audioCategorySchema.parse(audio.category),
    media: media && !media.deletedAt ? mapMediaPublic(media) : null,
  };
}

export async function listAudioMemories(
  db: Database,
  familyId: string,
  babyId: string,
) {
  await assertBabyInFamily(db, familyId, babyId);
  const audios = await db.query.audioMemories.findMany({
    where: and(
      eq(audioMemories.familyId, familyId),
      eq(audioMemories.babyId, babyId),
      isNull(audioMemories.deletedAt),
    ),
    orderBy: [desc(audioMemories.happenedAt), desc(audioMemories.createdAt)],
  });
  return Promise.all(audios.map((audio) => getAudioMemoryById(db, familyId, audio.id)));
}

export async function updateAudioMemory(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
  body: UpdateAudioMemoryBody,
) {
  const audio = await getAudioMemoryById(db, familyId, id);
  await db
    .update(audioMemories)
    .set({
      title: body.title ?? audio.title,
      category: body.category ?? audio.category,
      happenedAt: body.happenedAt ?? audio.happenedAt,
      timezoneName: body.timezoneName ?? audio.timezoneName,
      favorite: body.favorite !== undefined ? body.favorite : audio.favorite,
      updatedBy: actorUserId,
      updatedAt: Date.now(),
      version: audio.version + 1,
    })
    .where(and(eq(audioMemories.id, id), eq(audioMemories.familyId, familyId)));
  return getAudioMemoryById(db, familyId, id);
}

export async function deleteAudioMemory(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
) {
  const audio = await getAudioMemoryById(db, familyId, id);
  const now = Date.now();
  await db
    .update(audioMemories)
    .set({
      deletedAt: now,
      updatedBy: actorUserId,
      updatedAt: now,
      version: audio.version + 1,
    })
    .where(and(eq(audioMemories.id, id), eq(audioMemories.familyId, familyId)));
}

export async function restoreAudioMemory(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
  deviceId: string | null = null,
) {
  const deleted = await db.query.audioMemories.findFirst({
    where: and(
      eq(audioMemories.id, id),
      eq(audioMemories.familyId, familyId),
      isNotNull(audioMemories.deletedAt),
    ),
  });
  if (!deleted) throw new AppError('NOT_FOUND', '找不到可恢复的声音回忆', 404);
  await restoreTrashItem(db, actorUserId, familyId, 'AUDIO_MEMORY', id, deviceId);
  return getAudioMemoryById(db, familyId, id);
}

// --- First Moments ---
export async function createFirstMoment(
  db: Database,
  actorUserId: string,
  familyId: string,
  babyId: string,
  body: CreateFirstMomentBody,
) {
  await assertBabyInFamily(db, familyId, babyId);
  await validateMediaIds(db, familyId, body.mediaIds, babyId);
  const now = Date.now();
  const id = createUlid();
  await db.insert(firstMoments).values({
    id,
    familyId,
    babyId,
    title: body.title,
    description: body.description ?? null,
    happenedAt: body.happenedAt,
    timezoneName: body.timezoneName ?? 'Asia/Shanghai',
    favorite: body.favorite ?? false,
    createdBy: actorUserId,
    createdAt: now,
    updatedBy: actorUserId,
    updatedAt: now,
    version: 1,
  });
  if (body.mediaIds?.length) {
    await db.insert(firstMomentMedia).values(
      body.mediaIds.map((mediaId, sortOrder) => ({
        firstMomentId: id,
        mediaId,
        sortOrder,
      })),
    );
  }
  return getFirstMomentById(db, familyId, id);
}

export async function getFirstMomentById(db: Database, familyId: string, id: string) {
  const unscopedFirst = await db.query.firstMoments.findFirst({
    where: and(eq(firstMoments.id, id), isNull(firstMoments.deletedAt)),
  });
  if (unscopedFirst && unscopedFirst.familyId !== familyId) {
    throw new AppError('FAMILY_ACCESS_DENIED', '无权访问这个第一次记录', 403);
  }
  const first = await db.query.firstMoments.findFirst({
    where: and(
      eq(firstMoments.id, id),
      eq(firstMoments.familyId, familyId),
      isNull(firstMoments.deletedAt),
    ),
  });
  if (!first) throw new AppError('NOT_FOUND', '第一次记录不存在', 404);
  const links = await db.query.firstMomentMedia.findMany({
    where: eq(firstMomentMedia.firstMomentId, id),
    orderBy: [firstMomentMedia.sortOrder],
  });
  return { ...first, media: await getLinkedMedia(db, familyId, links) };
}

export async function listFirstMoments(db: Database, familyId: string, babyId: string) {
  await assertBabyInFamily(db, familyId, babyId);
  const firsts = await db.query.firstMoments.findMany({
    where: and(
      eq(firstMoments.familyId, familyId),
      eq(firstMoments.babyId, babyId),
      isNull(firstMoments.deletedAt),
    ),
    orderBy: [desc(firstMoments.happenedAt), desc(firstMoments.createdAt)],
  });
  return Promise.all(firsts.map((first) => getFirstMomentById(db, familyId, first.id)));
}

export async function updateFirstMoment(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
  body: UpdateFirstMomentBody,
) {
  const first = await getFirstMomentById(db, familyId, id);
  await validateMediaIds(db, familyId, body.mediaIds, first.babyId);
  await db
    .update(firstMoments)
    .set({
      title: body.title ?? first.title,
      description:
        body.description !== undefined ? body.description : first.description,
      happenedAt: body.happenedAt ?? first.happenedAt,
      timezoneName: body.timezoneName ?? first.timezoneName,
      favorite: body.favorite !== undefined ? body.favorite : first.favorite,
      updatedBy: actorUserId,
      updatedAt: Date.now(),
      version: first.version + 1,
    })
    .where(and(eq(firstMoments.id, id), eq(firstMoments.familyId, familyId)));
  if (body.mediaIds !== undefined) {
    await db.delete(firstMomentMedia).where(eq(firstMomentMedia.firstMomentId, id));
    if (body.mediaIds.length) {
      await db.insert(firstMomentMedia).values(
        body.mediaIds.map((mediaId, sortOrder) => ({
          firstMomentId: id,
          mediaId,
          sortOrder,
        })),
      );
    }
  }
  return getFirstMomentById(db, familyId, id);
}

export async function deleteFirstMoment(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
) {
  const first = await getFirstMomentById(db, familyId, id);
  const now = Date.now();
  await db
    .update(firstMoments)
    .set({
      deletedAt: now,
      updatedBy: actorUserId,
      updatedAt: now,
      version: first.version + 1,
    })
    .where(and(eq(firstMoments.id, id), eq(firstMoments.familyId, familyId)));
}

export async function restoreFirstMoment(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
  deviceId: string | null = null,
) {
  const deleted = await db.query.firstMoments.findFirst({
    where: and(
      eq(firstMoments.id, id),
      eq(firstMoments.familyId, familyId),
      isNotNull(firstMoments.deletedAt),
    ),
  });
  if (!deleted) throw new AppError('NOT_FOUND', '找不到可恢复的第一次记录', 404);
  await restoreTrashItem(db, actorUserId, familyId, 'FIRST_MOMENT', id, deviceId);
  return getFirstMomentById(db, familyId, id);
}

// --- Time Capsules ---
export async function createTimeCapsule(
  db: Database,
  actorUserId: string,
  familyId: string,
  babyId: string | undefined,
  body: CreateTimeCapsuleBody,
) {
  if (babyId) await assertBabyInFamily(db, familyId, babyId);
  await validateMediaIds(db, familyId, body.mediaIds, babyId);
  const now = Date.now();
  const id = createUlid();
  await db.insert(timeCapsules).values({
    id,
    familyId,
    babyId: babyId ?? null,
    creatorUserId: actorUserId,
    recipientText: body.recipientText ?? null,
    title: body.title,
    body: body.body,
    openAt: body.openAt,
    favorite: body.favorite ?? false,
    // Creation always enters DRAFT first; sealNow must use the same guarded
    // transition as the explicit seal endpoint.
    state: 'DRAFT',
    sealedAt: null,
    openedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  if (body.mediaIds?.length) {
    await db.insert(timeCapsuleMedia).values(
      body.mediaIds.map((mediaId, sortOrder) => ({
        timeCapsuleId: id,
        mediaId,
        sortOrder,
      })),
    );
  }
  if (body.sealNow) return sealTimeCapsule(db, actorUserId, familyId, id);
  return getTimeCapsuleById(db, familyId, id);
}

export async function getTimeCapsuleById(db: Database, familyId: string, id: string) {
  const unscopedCapsule = await db.query.timeCapsules.findFirst({
    where: and(eq(timeCapsules.id, id), isNull(timeCapsules.deletedAt)),
  });
  if (unscopedCapsule && unscopedCapsule.familyId !== familyId) {
    throw new AppError('FAMILY_ACCESS_DENIED', '无权访问这个家庭的时光胶囊', 403);
  }
  const capsule = await db.query.timeCapsules.findFirst({
    where: and(
      eq(timeCapsules.id, id),
      eq(timeCapsules.familyId, familyId),
      isNull(timeCapsules.deletedAt),
    ),
  });
  if (!capsule) throw new AppError('NOT_FOUND', '时光胶囊不存在', 404);
  const links = await db.query.timeCapsuleMedia.findMany({
    where: eq(timeCapsuleMedia.timeCapsuleId, id),
    orderBy: [timeCapsuleMedia.sortOrder],
  });
  return {
    ...capsule,
    body: capsule.state === 'SEALED' ? '' : capsule.body,
    state: capsuleStateSchema.parse(capsule.state),
    media: capsule.state === 'SEALED' ? [] : await getLinkedMedia(db, familyId, links),
  };
}

export async function listTimeCapsules(
  db: Database,
  familyId: string,
  babyId?: string,
) {
  if (babyId) await assertBabyInFamily(db, familyId, babyId);
  const capsules = await db.query.timeCapsules.findMany({
    where: and(
      eq(timeCapsules.familyId, familyId),
      babyId ? eq(timeCapsules.babyId, babyId) : undefined,
      isNull(timeCapsules.deletedAt),
    ),
    orderBy: [desc(timeCapsules.createdAt)],
  });
  return Promise.all(
    capsules.map((capsule) => getTimeCapsuleById(db, familyId, capsule.id)),
  );
}

export async function updateTimeCapsule(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
  body: UpdateTimeCapsuleBody,
  expectedVersion: number | null,
) {
  const capsule = await getTimeCapsuleById(db, familyId, id);
  if (expectedVersion === null) {
    throw new AppError('VALIDATION_ERROR', '更新时光胶囊需要 If-Match', 400);
  }
  if (expectedVersion !== capsule.version) {
    throw new AppError('ENTITY_VERSION_CONFLICT', '这封时光胶囊已在别处更新', 409);
  }
  if (capsule.state !== 'DRAFT') {
    throw new AppError('CAPSULE_SEALED', '时光胶囊已封存，不可直接修改', 409);
  }
  await validateMediaIds(db, familyId, body.mediaIds, capsule.babyId ?? undefined);
  const result = await db
    .update(timeCapsules)
    .set({
      title: body.title ?? capsule.title,
      body: body.body ?? capsule.body,
      openAt: body.openAt ?? capsule.openAt,
      favorite: body.favorite !== undefined ? body.favorite : capsule.favorite,
      recipientText:
        body.recipientText !== undefined ? body.recipientText : capsule.recipientText,
      updatedAt: Date.now(),
      version: capsule.version + 1,
    })
    .where(
      and(
        eq(timeCapsules.id, id),
        eq(timeCapsules.familyId, familyId),
        eq(timeCapsules.state, 'DRAFT'),
        eq(timeCapsules.version, expectedVersion),
        isNull(timeCapsules.deletedAt),
      ),
    );
  if (result.rowsAffected !== 1) {
    const latest = await db.query.timeCapsules.findFirst({
      where: and(
        eq(timeCapsules.id, id),
        eq(timeCapsules.familyId, familyId),
        isNull(timeCapsules.deletedAt),
      ),
    });
    if (latest?.state !== 'DRAFT') {
      throw new AppError('CAPSULE_SEALED', '时光胶囊已封存，不可直接修改', 409);
    }
    throw new AppError('ENTITY_VERSION_CONFLICT', '这封时光胶囊已在别处更新', 409);
  }
  if (body.mediaIds !== undefined) {
    await db.delete(timeCapsuleMedia).where(eq(timeCapsuleMedia.timeCapsuleId, id));
    if (body.mediaIds.length) {
      await db.insert(timeCapsuleMedia).values(
        body.mediaIds.map((mediaId, sortOrder) => ({
          timeCapsuleId: id,
          mediaId,
          sortOrder,
        })),
      );
    }
  }
  return getTimeCapsuleById(db, familyId, id);
}

/**
 * Favoriting is metadata, not an edit to the sealed payload. Keep it on a
 * dedicated mutation so SEALED still rejects ordinary content PATCH requests.
 */
export async function updateTimeCapsuleFavorite(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
  body: UpdateTimeCapsuleFavoriteBody,
) {
  const capsule = await getTimeCapsuleById(db, familyId, id);
  const result = await db
    .update(timeCapsules)
    .set({
      favorite: body.favorite,
      updatedAt: Date.now(),
      version: capsule.version + 1,
    })
    .where(
      and(
        eq(timeCapsules.id, id),
        eq(timeCapsules.familyId, familyId),
        eq(timeCapsules.version, capsule.version),
        isNull(timeCapsules.deletedAt),
      ),
    );
  if (result.rowsAffected !== 1) {
    throw new AppError('ENTITY_VERSION_CONFLICT', '这封时光胶囊已在别处更新', 409);
  }
  return getTimeCapsuleById(db, familyId, id);
}

export async function sealTimeCapsule(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
) {
  const capsule = await getTimeCapsuleById(db, familyId, id);
  if (capsule.state !== 'DRAFT') {
    throw new AppError(
      'INVALID_CAPSULE_STATE',
      `时光胶囊当前状态为 ${capsule.state}，无法再次封存`,
      400,
    );
  }
  const now = Date.now();
  const result = await db
    .update(timeCapsules)
    .set({
      state: 'SEALED',
      sealedAt: now,
      updatedAt: now,
      version: capsule.version + 1,
    })
    .where(
      and(
        eq(timeCapsules.id, id),
        eq(timeCapsules.familyId, familyId),
        eq(timeCapsules.state, 'DRAFT'),
        eq(timeCapsules.version, capsule.version),
        isNull(timeCapsules.deletedAt),
      ),
    );
  if (result.rowsAffected !== 1) {
    throw new AppError('INVALID_CAPSULE_STATE', '时光胶囊状态刚刚发生变化，请刷新后再试', 400);
  }
  return getTimeCapsuleById(db, familyId, id);
}

export async function openTimeCapsule(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
) {
  const capsule = await getTimeCapsuleById(db, familyId, id);
  const now = Date.now();
  if (capsule.state !== 'SEALED') {
    throw new AppError(
      'INVALID_CAPSULE_STATE',
      `时光胶囊当前状态为 ${capsule.state}，无法打开`,
      400,
    );
  }
  if (now < capsule.openAt) {
    throw new AppError('VALIDATION_ERROR', '时光胶囊尚未到达指定的开启时间', 400);
  }
  const result = await db
    .update(timeCapsules)
    .set({
      state: 'OPENED',
      openedAt: now,
      updatedAt: now,
      version: capsule.version + 1,
    })
    .where(
      and(
        eq(timeCapsules.id, id),
        eq(timeCapsules.familyId, familyId),
        eq(timeCapsules.state, 'SEALED'),
        eq(timeCapsules.version, capsule.version),
        lte(timeCapsules.openAt, now),
        isNull(timeCapsules.deletedAt),
      ),
    );
  if (result.rowsAffected !== 1) {
    throw new AppError('INVALID_CAPSULE_STATE', '时光胶囊状态刚刚发生变化，请刷新后再试', 400);
  }
  return getTimeCapsuleById(db, familyId, id);
}

export async function deleteTimeCapsule(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
) {
  const capsule = await getTimeCapsuleById(db, familyId, id);
  const now = Date.now();
  await db
    .update(timeCapsules)
    .set({ deletedAt: now, updatedAt: now, version: capsule.version + 1 })
    .where(and(eq(timeCapsules.id, id), eq(timeCapsules.familyId, familyId)));
}

export async function restoreTimeCapsule(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
  deviceId: string | null = null,
) {
  const deleted = await db.query.timeCapsules.findFirst({
    where: and(
      eq(timeCapsules.id, id),
      eq(timeCapsules.familyId, familyId),
      isNotNull(timeCapsules.deletedAt),
    ),
  });
  if (!deleted) throw new AppError('NOT_FOUND', '找不到可恢复的时光胶囊', 404);
  await restoreTrashItem(db, actorUserId, familyId, 'TIME_CAPSULE', id, deviceId);
  return getTimeCapsuleById(db, familyId, id);
}

type MemorySet = {
  photos: Awaited<ReturnType<typeof listPhotoMemories>>;
  quotes: Awaited<ReturnType<typeof listBabyQuotes>>;
  audios: Awaited<ReturnType<typeof listAudioMemories>>;
  firsts: Awaited<ReturnType<typeof listFirstMoments>>;
  capsules: Awaited<ReturnType<typeof listTimeCapsules>>;
};

async function loadMemorySet(
  db: Database,
  familyId: string,
  babyId: string,
): Promise<MemorySet> {
  const [photos, quotes, audios, firsts, capsules] = await Promise.all([
    listPhotoMemories(db, familyId, babyId),
    listBabyQuotes(db, familyId, babyId),
    listAudioMemories(db, familyId, babyId),
    listFirstMoments(db, familyId, babyId),
    listTimeCapsules(db, familyId, babyId),
  ]);
  return { photos, quotes, audios, firsts, capsules };
}

function isInUtcYear(timestamp: number, year: number) {
  return new Date(timestamp).getUTCFullYear() === year;
}

function isOnUtcMonthDay(timestamp: number, now: Date) {
  const date = new Date(timestamp);
  return (
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate() &&
    date.getUTCFullYear() === now.getUTCFullYear() - 1
  );
}

function countFavorites(memorySet: MemorySet) {
  return [
    ...memorySet.photos,
    ...memorySet.quotes,
    ...memorySet.audios,
    ...memorySet.firsts,
    ...memorySet.capsules,
  ].filter((memory) => memory.favorite).length;
}

export async function getMemoriesHomeSummary(
  db: Database,
  babyId: string,
  familyId: string,
) {
  const memorySet = await loadMemorySet(db, familyId, babyId);
  const onThisDay = await getOnThisDayMemories(db, babyId, familyId);
  return {
    photosCount: memorySet.photos.length,
    quotesCount: memorySet.quotes.length,
    audiosCount: memorySet.audios.length,
    firstsCount: memorySet.firsts.length,
    capsulesCount: memorySet.capsules.length,
    favoritesCount: countFavorites(memorySet),
    onThisDayCount:
      onThisDay.photos.length +
      onThisDay.quotes.length +
      onThisDay.audios.length +
      onThisDay.firsts.length +
      onThisDay.capsules.length,
    recentPhotos: memorySet.photos.slice(0, 6),
    recentQuote: memorySet.quotes[0] ?? null,
    recentAudio: memorySet.audios[0] ?? null,
    sealedCapsules: memorySet.capsules.filter((capsule) => capsule.state === 'SEALED'),
  };
}

export async function getOnThisDayMemories(
  db: Database,
  babyId: string,
  familyId: string,
) {
  const memorySet = await loadMemorySet(db, familyId, babyId);
  const now = new Date();
  return {
    yearsAgo: 1,
    photos: memorySet.photos.filter((memory) =>
      isOnUtcMonthDay(memory.happenedAt, now),
    ),
    quotes: memorySet.quotes.filter((memory) =>
      isOnUtcMonthDay(memory.happenedAt, now),
    ),
    audios: memorySet.audios.filter((memory) =>
      isOnUtcMonthDay(memory.happenedAt, now),
    ),
    firsts: memorySet.firsts.filter((memory) =>
      isOnUtcMonthDay(memory.happenedAt, now),
    ),
    capsules: memorySet.capsules.filter((memory) =>
      isOnUtcMonthDay(memory.createdAt, now),
    ),
  };
}

export async function getFavoriteMemories(
  db: Database,
  babyId: string,
  familyId: string,
): Promise<MemoriesFavorites> {
  const memorySet = await loadMemorySet(db, familyId, babyId);
  const favorites = {
    photos: memorySet.photos.filter((memory) => memory.favorite),
    quotes: memorySet.quotes.filter((memory) => memory.favorite),
    audios: memorySet.audios.filter((memory) => memory.favorite),
    firsts: memorySet.firsts.filter((memory) => memory.favorite),
    capsules: memorySet.capsules.filter((memory) => memory.favorite),
  };
  return { ...favorites, totalCount: Object.values(favorites).flat().length };
}

export async function getAnnualReview(
  db: Database,
  babyId: string,
  familyId: string,
  year: number,
): Promise<AnnualReviewResponse> {
  const memorySet = await loadMemorySet(db, familyId, babyId);
  const photos = memorySet.photos.filter((memory) =>
    isInUtcYear(memory.happenedAt, year),
  );
  const quotes = memorySet.quotes.filter((memory) =>
    isInUtcYear(memory.happenedAt, year),
  );
  const audios = memorySet.audios.filter((memory) =>
    isInUtcYear(memory.happenedAt, year),
  );
  const firsts = memorySet.firsts.filter((memory) =>
    isInUtcYear(memory.happenedAt, year),
  );
  const capsules = memorySet.capsules.filter((memory) =>
    isInUtcYear(memory.createdAt, year),
  );
  const selected = { photos, quotes, audios, firsts, capsules };
  const all = Object.values(selected).flat();
  const favoritesCount = all.filter(
    (memory) => 'favorite' in memory && memory.favorite,
  ).length;
  return {
    year,
    ...selected,
    photosCount: photos.length,
    quotesCount: quotes.length,
    audiosCount: audios.length,
    firstsCount: firsts.length,
    capsulesCount: capsules.length,
    favoritesCount,
    totalCount: all.length,
  };
}
