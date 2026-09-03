import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { babies, families, users } from './identity';

export const mediaFiles = sqliteTable(
  'media_files',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    babyId: text('baby_id').references(() => babies.id),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    mediaType: text('media_type').notNull(), // IMAGE | AUDIO | VIDEO | FILE
    status: text('status').notNull().default('PENDING'), // PENDING | UPLOADING | PROCESSING | READY | FAILED | DELETED
    storageKey: text('storage_key'),
    originalStorageKey: text('original_storage_key'),
    thumbnailStorageKey: text('thumbnail_storage_key'),
    mimeType: text('mime_type').notNull(),
    originalFilename: text('original_filename'),
    sizeBytes: integer('size_bytes'),
    sha256: text('sha256'),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    waveformJson: text('waveform_json'),
    keepOriginal: integer('keep_original', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    version: integer('version').notNull().default(1),
    deletedAt: integer('deleted_at'),
  },
  (table) => ({
    familyIdx: index('idx_media_files_family').on(table.familyId),
    ownerIdx: index('idx_media_files_owner').on(table.ownerUserId),
  }),
);

export const mediaUploads = sqliteTable(
  'media_uploads',
  {
    id: text('id').primaryKey(),
    mediaId: text('media_id')
      .notNull()
      .references(() => mediaFiles.id),
    uploadTokenHash: text('upload_token_hash').notNull(),
    expectedSize: integer('expected_size').notNull(),
    expectedSha256: text('expected_sha256'),
    chunkSize: integer('chunk_size').notNull().default(4194304), // 4 MiB
    receivedBytes: integer('received_bytes').notNull().default(0),
    status: text('status').notNull().default('INIT'), // INIT | UPLOADING | COMPLETE | EXPIRED
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    mediaIdx: index('idx_media_uploads_media').on(table.mediaId),
  }),
);

export const mediaUploadParts = sqliteTable(
  'media_upload_parts',
  {
    uploadId: text('upload_id')
      .notNull()
      .references(() => mediaUploads.id),
    partNo: integer('part_no').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    tempPath: text('temp_path').notNull(),
    receivedAt: integer('received_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.uploadId, table.partNo] }),
  }),
);
