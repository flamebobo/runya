import { eq, and, isNull, isNotNull, desc, inArray } from 'drizzle-orm';
import {
  photoMemories,
  photoMemoryMedia,
  babyQuotes,
  audioMemories,
  firstMoments,
  firstMomentMedia,
  timeCapsules,
  timeCapsuleMedia,
  mediaFiles,
} from '@runew/db';
import type {
  CreatePhotoMemoryBody,
  UpdatePhotoMemoryBody,
  CreateBabyQuoteBody,
  UpdateBabyQuoteBody,
  CreateAudioMemoryBody,
  UpdateAudioMemoryBody,
  CreateFirstMomentBody,
  UpdateFirstMomentBody,
  CreateTimeCapsuleBody,
  UpdateTimeCapsuleBody,
} from '@runew/contracts';
import { createUlid } from '@runew/shared-utils';
import { AppError } from '../../lib/errors.js';
import type { Database } from '../../plugins/db.js';

// Helper to format Media Public DTO
function mapMediaPublic(m: typeof mediaFiles.$inferSelect) {
  return {
    id: m.id,
    familyId: m.familyId,
    babyId: m.babyId,
    ownerUserId: m.ownerUserId,
    mediaType: m.mediaType as any,
    status: m.status as any,
    mimeType: m.mimeType,
    originalFilename: m.originalFilename,
    sizeBytes: m.sizeBytes,
    width: m.width,
    height: m.height,
    durationMs: m.durationMs,
    waveformJson: m.waveformJson,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

// --- Photos ---
export async function createPhotoMemory(
  db: Database,
  actorUserId: string,
  familyId: string,
  babyId: string,
  body: CreatePhotoMemoryBody,
) {
  const now = Date.now();
  const photoMemoryId = createUlid();

  await db.insert(photoMemories).values({
    id: photoMemoryId,
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

  if (body.mediaIds && body.mediaIds.length > 0) {
    const mediaLinks = body.mediaIds.map((mediaId, idx) => ({
      photoMemoryId,
      mediaId,
      sortOrder: idx,
    }));
    await db.insert(photoMemoryMedia).values(mediaLinks);
  }

  return getPhotoMemoryById(db, familyId, photoMemoryId);
}

export async function getPhotoMemoryById(db: Database, familyId: string, id: string) {
  const photo = await db.query.photoMemories.findFirst({
    where: and(
      eq(photoMemories.id, id),
      eq(photoMemories.familyId, familyId),
      isNull(photoMemories.deletedAt),
    ),
  });

  if (!photo) {
    throw new AppError('NOT_FOUND', '照片回忆不存在', 404);
  }

  const links = await db.query.photoMemoryMedia.findMany({
    where: eq(photoMemoryMedia.photoMemoryId, id),
    orderBy: [photoMemoryMedia.sortOrder],
  });

  const mediaIds = links.map((l) => l.mediaId);
  const mediaRecords = mediaIds.length > 0
    ? await db.query.mediaFiles.findMany({
        where: inArray(mediaFiles.id, mediaIds),
      })
    : [];

  const mediaMap = new Map(mediaRecords.map((m) => [m.id, mapMediaPublic(m)]));
  const media = mediaIds.map((id) => mediaMap.get(id)).filter(Boolean) as any[];

  return {
    ...photo,
    media,
  };
}

export async function listPhotoMemories(db: Database, familyId: string, babyId: string) {
  const photos = await db.query.photoMemories.findMany({
    where: and(
      eq(photoMemories.familyId, familyId),
      eq(photoMemories.babyId, babyId),
      isNull(photoMemories.deletedAt),
    ),
    orderBy: [desc(photoMemories.happenedAt), desc(photoMemories.createdAt)],
  });

  const results = [];
  for (const photo of photos) {
    results.push(await getPhotoMemoryById(db, familyId, photo.id));
  }
  return results;
}

export async function updatePhotoMemory(
  db: Database,
  actorUserId: string,
  familyId: string,
  id: string,
  body: UpdatePhotoMemoryBody,
) {
  const photo = await getPhotoMemoryById(db, familyId, id);
  const now = Date.now();

  await db
    .update(photoMemories)
    .set({
      title: body.title ?? photo.title,
      story: body.story !== undefined ? body.story : photo.story,
      happenedAt: body.happenedAt ?? photo.happenedAt,
      timezoneName: body.timezoneName ?? photo.timezoneName,
      favorite: body.favorite !== undefined ? body.favorite : photo.favorite,
      updatedBy: actorUserId,
      updatedAt: now,
      version: photo.version + 1,
    })
    .where(eq(photoMemories.id, id));

  if (body.mediaIds !== undefined) {
    await db.delete(photoMemoryMedia).where(eq(photoMemoryMedia.photoMemoryId, id));
    if (body.mediaIds.length > 0) {
      const mediaLinks = body.mediaIds.map((mediaId, idx) => ({
        photoMemoryId: id,
        mediaId,
        sortOrder: idx,
      }));
      await db.insert(photoMemoryMedia).values(mediaLinks);
    }
  }

  return getPhotoMemoryById(db, familyId, id);
}

export async function deletePhotoMemory(db: Database, actorUserId: string, familyId: string, id: string) {
  await getPhotoMemoryById(db, familyId, id);
  const now = Date.now();

  await db
    .update(photoMemories)
    .set({
      deletedAt: now,
      updatedBy: actorUserId,
      updatedAt: now,
    })
    .where(and(eq(photoMemories.id, id), eq(photoMemories.familyId, familyId)));
}

export async function restorePhotoMemory(db: Database, actorUserId: string, familyId: string, id: string) {
  const deleted = await db.query.photoMemories.findFirst({
    where: and(
      eq(photoMemories.id, id),
      eq(photoMemories.familyId, familyId),
      isNotNull(photoMemories.deletedAt),
    ),
  });
  if (!deleted) throw new AppError('NOT_FOUND', '找不到可恢復的照片回憶', 404);

  await db
    .update(photoMemories)
    .set({
      deletedAt: null,
      updatedBy: actorUserId,
      updatedAt: Date.now(),
      version: deleted.version + 1,
    })
    .where(and(eq(photoMemories.id, id), eq(photoMemories.familyId, familyId)));
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
  const now = Date.now();
  const quoteId = createUlid();

  await db.insert(babyQuotes).values({
    id: quoteId,
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

  return getBabyQuoteById(db, quoteId);
}

export async function getBabyQuoteById(db: Database, id: string) {
  const quote = await db.query.babyQuotes.findFirst({
    where: and(eq(babyQuotes.id, id), isNull(babyQuotes.deletedAt)),
  });

  if (!quote) {
    throw new AppError('NOT_FOUND', '宝宝语录不存在', 404);
  }

  let audioMedia = null;
  if (quote.audioMediaId) {
    const m = await db.query.mediaFiles.findFirst({
      where: eq(mediaFiles.id, quote.audioMediaId),
    });
    if (m) audioMedia = mapMediaPublic(m);
  }

  return {
    ...quote,
    audioMedia,
  };
}

export async function listBabyQuotes(db: Database, babyId: string) {
  const quotes = await db.query.babyQuotes.findMany({
    where: and(eq(babyQuotes.babyId, babyId), isNull(babyQuotes.deletedAt)),
    orderBy: [desc(babyQuotes.happenedAt), desc(babyQuotes.createdAt)],
  });

  const results = [];
  for (const q of quotes) {
    results.push(await getBabyQuoteById(db, q.id));
  }
  return results;
}

export async function updateBabyQuote(
  db: Database,
  actorUserId: string,
  id: string,
  body: UpdateBabyQuoteBody,
) {
  const quote = await getBabyQuoteById(db, id);
  const now = Date.now();

  await db
    .update(babyQuotes)
    .set({
      quoteText: body.quoteText ?? quote.quoteText,
      audioMediaId: body.audioMediaId !== undefined ? body.audioMediaId : quote.audioMediaId,
      happenedAt: body.happenedAt ?? quote.happenedAt,
      timezoneName: body.timezoneName ?? quote.timezoneName,
      favorite: body.favorite !== undefined ? body.favorite : quote.favorite,
      updatedBy: actorUserId,
      updatedAt: now,
      version: quote.version + 1,
    })
    .where(eq(babyQuotes.id, id));

  return getBabyQuoteById(db, id);
}

export async function deleteBabyQuote(db: Database, actorUserId: string, id: string) {
  await getBabyQuoteById(db, id);
  const now = Date.now();

  await db
    .update(babyQuotes)
    .set({
      deletedAt: now,
      updatedBy: actorUserId,
      updatedAt: now,
    })
    .where(eq(babyQuotes.id, id));
}

// --- Audio Memories ---
export async function createAudioMemory(
  db: Database,
  actorUserId: string,
  familyId: string,
  babyId: string,
  body: CreateAudioMemoryBody,
) {
  const now = Date.now();
  const audioMemoryId = createUlid();

  await db.insert(audioMemories).values({
    id: audioMemoryId,
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

  return getAudioMemoryById(db, audioMemoryId);
}

export async function getAudioMemoryById(db: Database, id: string) {
  const audio = await db.query.audioMemories.findFirst({
    where: and(eq(audioMemories.id, id), isNull(audioMemories.deletedAt)),
  });

  if (!audio) {
    throw new AppError('NOT_FOUND', '声音回忆不存在', 404);
  }

  const m = await db.query.mediaFiles.findFirst({
    where: eq(mediaFiles.id, audio.mediaId),
  });

  return {
    ...audio,
    media: m ? mapMediaPublic(m) : null,
  };
}

export async function listAudioMemories(db: Database, babyId: string) {
  const audios = await db.query.audioMemories.findMany({
    where: and(eq(audioMemories.babyId, babyId), isNull(audioMemories.deletedAt)),
    orderBy: [desc(audioMemories.happenedAt), desc(audioMemories.createdAt)],
  });

  const results = [];
  for (const a of audios) {
    results.push(await getAudioMemoryById(db, a.id));
  }
  return results;
}

export async function updateAudioMemory(
  db: Database,
  actorUserId: string,
  id: string,
  body: UpdateAudioMemoryBody,
) {
  const audio = await getAudioMemoryById(db, id);
  const now = Date.now();

  await db
    .update(audioMemories)
    .set({
      title: body.title ?? audio.title,
      category: body.category ?? audio.category,
      happenedAt: body.happenedAt ?? audio.happenedAt,
      timezoneName: body.timezoneName ?? audio.timezoneName,
      favorite: body.favorite !== undefined ? body.favorite : audio.favorite,
      updatedBy: actorUserId,
      updatedAt: now,
      version: audio.version + 1,
    })
    .where(eq(audioMemories.id, id));

  return getAudioMemoryById(db, id);
}

export async function deleteAudioMemory(db: Database, actorUserId: string, id: string) {
  await getAudioMemoryById(db, id);
  const now = Date.now();

  await db
    .update(audioMemories)
    .set({
      deletedAt: now,
      updatedBy: actorUserId,
      updatedAt: now,
    })
    .where(eq(audioMemories.id, id));
}

// --- First Moments ---
export async function createFirstMoment(
  db: Database,
  actorUserId: string,
  familyId: string,
  babyId: string,
  body: CreateFirstMomentBody,
) {
  const now = Date.now();
  const firstId = createUlid();

  await db.insert(firstMoments).values({
    id: firstId,
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

  if (body.mediaIds && body.mediaIds.length > 0) {
    const mediaLinks = body.mediaIds.map((mediaId, idx) => ({
      firstMomentId: firstId,
      mediaId,
      sortOrder: idx,
    }));
    await db.insert(firstMomentMedia).values(mediaLinks);
  }

  return getFirstMomentById(db, firstId);
}

export async function getFirstMomentById(db: Database, id: string) {
  const first = await db.query.firstMoments.findFirst({
    where: and(eq(firstMoments.id, id), isNull(firstMoments.deletedAt)),
  });

  if (!first) {
    throw new AppError('NOT_FOUND', '第一次记录不存在', 404);
  }

  const links = await db.query.firstMomentMedia.findMany({
    where: eq(firstMomentMedia.firstMomentId, id),
    orderBy: [firstMomentMedia.sortOrder],
  });

  const mediaIds = links.map((l) => l.mediaId);
  const mediaRecords = mediaIds.length > 0
    ? await db.query.mediaFiles.findMany({
        where: inArray(mediaFiles.id, mediaIds),
      })
    : [];

  const mediaMap = new Map(mediaRecords.map((m) => [m.id, mapMediaPublic(m)]));
  const media = mediaIds.map((id) => mediaMap.get(id)).filter(Boolean) as any[];

  return {
    ...first,
    media,
  };
}

export async function listFirstMoments(db: Database, babyId: string) {
  const firsts = await db.query.firstMoments.findMany({
    where: and(eq(firstMoments.babyId, babyId), isNull(firstMoments.deletedAt)),
    orderBy: [desc(firstMoments.happenedAt), desc(firstMoments.createdAt)],
  });

  const results = [];
  for (const f of firsts) {
    results.push(await getFirstMomentById(db, f.id));
  }
  return results;
}

export async function updateFirstMoment(
  db: Database,
  actorUserId: string,
  id: string,
  body: UpdateFirstMomentBody,
) {
  const first = await getFirstMomentById(db, id);
  const now = Date.now();

  await db
    .update(firstMoments)
    .set({
      title: body.title ?? first.title,
      description: body.description !== undefined ? body.description : first.description,
      happenedAt: body.happenedAt ?? first.happenedAt,
      timezoneName: body.timezoneName ?? first.timezoneName,
      favorite: body.favorite !== undefined ? body.favorite : first.favorite,
      updatedBy: actorUserId,
      updatedAt: now,
      version: first.version + 1,
    })
    .where(eq(firstMoments.id, id));

  if (body.mediaIds !== undefined) {
    await db.delete(firstMomentMedia).where(eq(firstMomentMedia.firstMomentId, id));
    if (body.mediaIds.length > 0) {
      const mediaLinks = body.mediaIds.map((mediaId, idx) => ({
        firstMomentId: id,
        mediaId,
        sortOrder: idx,
      }));
      await db.insert(firstMomentMedia).values(mediaLinks);
    }
  }

  return getFirstMomentById(db, id);
}

export async function deleteFirstMoment(db: Database, actorUserId: string, id: string) {
  await getFirstMomentById(db, id);
  const now = Date.now();

  await db
    .update(firstMoments)
    .set({
      deletedAt: now,
      updatedBy: actorUserId,
      updatedAt: now,
    })
    .where(eq(firstMoments.id, id));
}

// --- Time Capsules ---
export async function createTimeCapsule(
  db: Database,
  actorUserId: string,
  familyId: string,
  babyId: string | undefined,
  body: CreateTimeCapsuleBody,
) {
  const now = Date.now();
  const capsuleId = createUlid();
  const initialState = body.sealNow ? 'SEALED' : 'DRAFT';

  await db.insert(timeCapsules).values({
    id: capsuleId,
    familyId,
    babyId: babyId ?? null,
    creatorUserId: actorUserId,
    recipientText: body.recipientText ?? null,
    title: body.title,
    body: body.body,
    openAt: body.openAt,
    state: initialState,
    sealedAt: body.sealNow ? now : null,
    openedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
  });

  if (body.mediaIds && body.mediaIds.length > 0) {
    const mediaLinks = body.mediaIds.map((mediaId, idx) => ({
      timeCapsuleId: capsuleId,
      mediaId,
      sortOrder: idx,
    }));
    await db.insert(timeCapsuleMedia).values(mediaLinks);
  }

  return getTimeCapsuleById(db, capsuleId);
}

export async function getTimeCapsuleById(db: Database, id: string) {
  const capsule = await db.query.timeCapsules.findFirst({
    where: and(eq(timeCapsules.id, id), isNull(timeCapsules.deletedAt)),
  });

  if (!capsule) {
    throw new AppError('NOT_FOUND', '时光胶囊不存在', 404);
  }

  const links = await db.query.timeCapsuleMedia.findMany({
    where: eq(timeCapsuleMedia.timeCapsuleId, id),
    orderBy: [timeCapsuleMedia.sortOrder],
  });

  const mediaIds = links.map((l) => l.mediaId);
  const mediaRecords = mediaIds.length > 0
    ? await db.query.mediaFiles.findMany({
        where: inArray(mediaFiles.id, mediaIds),
      })
    : [];

  const mediaMap = new Map(mediaRecords.map((m) => [m.id, mapMediaPublic(m)]));
  const media = mediaIds.map((id) => mediaMap.get(id)).filter(Boolean) as any[];

  return {
    ...capsule,
    media,
  };
}

export async function listTimeCapsules(db: Database, familyId: string) {
  const capsules = await db.query.timeCapsules.findMany({
    where: and(eq(timeCapsules.familyId, familyId), isNull(timeCapsules.deletedAt)),
    orderBy: [desc(timeCapsules.createdAt)],
  });

  const results = [];
  for (const c of capsules) {
    results.push(await getTimeCapsuleById(db, c.id));
  }
  return results;
}

export async function updateTimeCapsule(
  db: Database,
  actorUserId: string,
  id: string,
  body: UpdateTimeCapsuleBody,
) {
  const capsule = await getTimeCapsuleById(db, id);

  // State Machine Enforcement: SEALED or OPENED capsules reject normal PATCH
  if (capsule.state !== 'DRAFT') {
    throw new AppError('CAPSULE_SEALED', '时光胶囊已封存，不可直接修改', 409);
  }

  const now = Date.now();
  await db
    .update(timeCapsules)
    .set({
      title: body.title ?? capsule.title,
      body: body.body ?? capsule.body,
      openAt: body.openAt ?? capsule.openAt,
      recipientText: body.recipientText !== undefined ? body.recipientText : capsule.recipientText,
      updatedAt: now,
      version: capsule.version + 1,
    })
    .where(eq(timeCapsules.id, id));

  if (body.mediaIds !== undefined) {
    await db.delete(timeCapsuleMedia).where(eq(timeCapsuleMedia.timeCapsuleId, id));
    if (body.mediaIds.length > 0) {
      const mediaLinks = body.mediaIds.map((mediaId, idx) => ({
        timeCapsuleId: id,
        mediaId,
        sortOrder: idx,
      }));
      await db.insert(timeCapsuleMedia).values(mediaLinks);
    }
  }

  return getTimeCapsuleById(db, id);
}

export async function sealTimeCapsule(db: Database, actorUserId: string, id: string) {
  const capsule = await getTimeCapsuleById(db, id);

  if (capsule.state !== 'DRAFT') {
    throw new AppError('INVALID_CAPSULE_STATE', `时光胶囊当前状态为 ${capsule.state}，无法再次封存`, 400);
  }

  const now = Date.now();
  await db
    .update(timeCapsules)
    .set({
      state: 'SEALED',
      sealedAt: now,
      updatedAt: now,
      version: capsule.version + 1,
    })
    .where(eq(timeCapsules.id, id));

  return getTimeCapsuleById(db, id);
}

export async function openTimeCapsule(db: Database, actorUserId: string, id: string) {
  const capsule = await getTimeCapsuleById(db, id);
  const now = Date.now();

  if (capsule.state !== 'SEALED') {
    throw new AppError('INVALID_CAPSULE_STATE', `时光胶囊当前状态为 ${capsule.state}，无法打开`, 400);
  }

  if (now < capsule.openAt) {
    throw new AppError('VALIDATION_ERROR', '时光胶囊尚未到达指定的开启时间', 400);
  }

  await db
    .update(timeCapsules)
    .set({
      state: 'OPENED',
      openedAt: now,
      updatedAt: now,
      version: capsule.version + 1,
    })
    .where(eq(timeCapsules.id, id));

  return getTimeCapsuleById(db, id);
}

export async function deleteTimeCapsule(db: Database, actorUserId: string, id: string) {
  await getTimeCapsuleById(db, id);
  const now = Date.now();

  await db
    .update(timeCapsules)
    .set({
      deletedAt: now,
      updatedAt: now,
    })
    .where(eq(timeCapsules.id, id));
}

// --- Summary & On-This-Day ---
export async function getMemoriesHomeSummary(db: Database, babyId: string, familyId: string) {
  const photos = await listPhotoMemories(db, babyId);
  const quotes = await listBabyQuotes(db, babyId);
  const audios = await listAudioMemories(db, babyId);
  const firsts = await listFirstMoments(db, babyId);
  const capsules = await listTimeCapsules(db, familyId);

  const favoritesCount =
    photos.filter((p) => p.favorite).length +
    quotes.filter((q) => q.favorite).length +
    audios.filter((a) => a.favorite).length +
    firsts.filter((f) => f.favorite).length;

  const sealedCapsules = capsules.filter((c) => c.state === 'SEALED');

  return {
    photosCount: photos.length,
    quotesCount: quotes.length,
    audiosCount: audios.length,
    firstsCount: firsts.length,
    capsulesCount: capsules.length,
    favoritesCount,
    onThisDayCount: 0,
    recentPhotos: photos.slice(0, 6),
    recentQuote: quotes[0] ?? null,
    recentAudio: audios[0] ?? null,
    sealedCapsules,
  };
}

export async function getOnThisDayMemories(db: Database, babyId: string) {
  const now = new Date();
  const currentMonth = now.getUTCMonth();
  const currentDay = now.getUTCDate();
  const currentYear = now.getUTCFullYear();

  const photos = await listPhotoMemories(db, babyId);
  const quotes = await listBabyQuotes(db, babyId);
  const audios = await listAudioMemories(db, babyId);
  const firsts = await listFirstMoments(db, babyId);

  const isSameDay = (timestamp: number) => {
    const d = new Date(timestamp);
    return (
      d.getUTCMonth() === currentMonth &&
      d.getUTCDate() === currentDay &&
      d.getUTCFullYear() < currentYear
    );
  };

  const filteredPhotos = photos.filter((p) => isSameDay(p.happenedAt));
  const filteredQuotes = quotes.filter((q) => isSameDay(q.happenedAt));
  const filteredAudios = audios.filter((a) => isSameDay(a.happenedAt));
  const filteredFirsts = firsts.filter((f) => isSameDay(f.happenedAt));

  return {
    yearsAgo: 1,
    photos: filteredPhotos,
    quotes: filteredQuotes,
    audios: filteredAudios,
    firsts: filteredFirsts,
  };
}
