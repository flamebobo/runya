import Taro from '@tarojs/taro';
import { createUlid } from '@runew/shared-utils';

const MEDIA_DB_NAME = 'runew-media-v1';
const MEDIA_DB_VERSION = 1;
const OPFS_METADATA_DIR = 'runew-media-v1';
const memoryRecords = new Map<string, DurableLocalMedia>();
const memoryBlobs = new Map<string, Blob>();
const memoryQueue = new Map<string, MediaUploadQueueEntry>();

export type DurableStorage = 'WEAPP_USER_DATA_PATH' | 'OPFS' | 'INDEXED_DB';

export interface DurableLocalMedia {
  localId: string;
  durablePath: string;
  storage: DurableStorage;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
}

export interface MediaUploadQueueEntry {
  localId: string;
  durablePath: string;
  mediaType: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'FILE';
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
  babyId?: string;
  uploadId?: string;
  mediaId?: string;
  uploadToken?: string;
  status: 'PENDING' | 'UPLOADING' | 'FAILED' | 'COMPLETE';
  attempts: number;
  lastError?: string;
  updatedAt: number;
}

type IdbStore = 'records' | 'blobs' | 'queue';

function isWeapp() {
  return Taro.getEnv() === Taro.ENV_TYPE.WEAPP;
}

function canUseIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function canUseOpfs() {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function'
  );
}

function openMediaDb(): Promise<IDBDatabase> {
  if (!canUseIndexedDb()) return Promise.reject(new Error('当前环境没有 IndexedDB'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MEDIA_DB_NAME, MEDIA_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const store of ['records', 'blobs', 'queue']) {
        if (!database.objectStoreNames.contains(store))
          database.createObjectStore(store);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('打开本地媒体库失败'));
  });
}

async function idbPut(store: IdbStore, key: string, value: unknown) {
  const database = await openMediaDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(store, 'readwrite');
    transaction.objectStore(store).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('写入本地媒体库失败'));
  });
  database.close();
}

async function idbGet<T>(store: IdbStore, key: string): Promise<T | undefined> {
  const database = await openMediaDb();
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction(store, 'readonly');
    const request = transaction.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error('读取本地媒体库失败'));
  });
  database.close();
  return value;
}

async function idbDelete(store: IdbStore, key: string) {
  const database = await openMediaDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(store, 'readwrite');
    transaction.objectStore(store).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('删除本地媒体库记录失败'));
  });
  database.close();
}

async function idbGetAll<T>(store: IdbStore): Promise<T[]> {
  const database = await openMediaDb();
  const values = await new Promise<T[]>((resolve, reject) => {
    const transaction = database.transaction(store, 'readonly');
    const request = transaction.objectStore(store).getAll();
    request.onsuccess = () => resolve((request.result as T[]) ?? []);
    request.onerror = () => reject(request.error ?? new Error('读取本地媒体队列失败'));
  });
  database.close();
  return values;
}

type OpfsMetadataStore = 'records' | 'queue';

async function getOpfsMetadataStore(
  store: OpfsMetadataStore,
  create = false,
): Promise<FileSystemDirectoryHandle | undefined> {
  if (!canUseOpfs()) return undefined;
  try {
    const root = await navigator.storage.getDirectory();
    const namespace = await root.getDirectoryHandle(OPFS_METADATA_DIR, { create });
    return namespace.getDirectoryHandle(store, { create });
  } catch (error) {
    if (!create) return undefined;
    throw error;
  }
}

async function putOpfsJson(
  store: OpfsMetadataStore,
  key: string,
  value: unknown,
) {
  const directory = await getOpfsMetadataStore(store, true);
  if (!directory) throw new Error('当前浏览器不支持 OPFS 元数据保存');
  const fileHandle = await directory.getFileHandle(`${key}.json`, { create: true });
  // createWritable().close() commits the complete metadata document instead of
  // exposing a partially written JSON value after an interrupted write.
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(value));
  await writable.close();
}

async function getOpfsJson<T>(store: OpfsMetadataStore, key: string) {
  const directory = await getOpfsMetadataStore(store);
  if (!directory) return undefined;
  try {
    const fileHandle = await directory.getFileHandle(`${key}.json`);
    return JSON.parse(await (await fileHandle.getFile()).text()) as T;
  } catch {
    return undefined;
  }
}

async function deleteOpfsJson(store: OpfsMetadataStore, key: string) {
  const directory = await getOpfsMetadataStore(store);
  if (!directory) return;
  await directory.removeEntry(`${key}.json`).catch(() => undefined);
}

async function listOpfsJson<T>(store: OpfsMetadataStore) {
  const directory = await getOpfsMetadataStore(store);
  if (!directory) return [] as T[];
  const values: T[] = [];
  const entries = (
    directory as unknown as {
      entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
    }
  ).entries();
  for await (const [name, handle] of entries) {
    if (!name.endsWith('.json') || handle.kind !== 'file') continue;
    try {
      const fileHandle = handle as FileSystemFileHandle;
      values.push(JSON.parse(await (await fileHandle.getFile()).text()) as T);
    } catch {
      // A malformed stale metadata file should not hide the rest of the queue.
    }
  }
  return values;
}

async function putRecord(record: DurableLocalMedia) {
  memoryRecords.set(record.localId, record);
  if (isWeapp()) {
    Taro.setStorageSync(`runew_media_record:${record.localId}`, record);
  } else if (canUseIndexedDb()) {
    await idbPut('records', record.localId, record);
  } else {
    await putOpfsJson('records', record.localId, record);
  }
}

async function getRecord(localId: string) {
  const cached = memoryRecords.get(localId);
  if (cached) return cached;
  if (isWeapp()) {
    const record = Taro.getStorageSync(`runew_media_record:${localId}`) as
      DurableLocalMedia | undefined;
    if (record) memoryRecords.set(localId, record);
    return record;
  }
  const record = canUseIndexedDb()
    ? await idbGet<DurableLocalMedia>('records', localId)
    : await getOpfsJson<DurableLocalMedia>('records', localId);
  if (record) memoryRecords.set(localId, record);
  return record;
}

async function putBlob(localId: string, blob: Blob) {
  memoryBlobs.set(localId, blob);
  if (canUseIndexedDb()) await idbPut('blobs', localId, blob);
}

async function getBlob(localId: string) {
  const cached = memoryBlobs.get(localId);
  if (cached) return cached;
  if (!canUseIndexedDb()) return undefined;
  const blob = await idbGet<Blob>('blobs', localId);
  if (blob) memoryBlobs.set(localId, blob);
  return blob;
}

async function putQueueEntry(entry: MediaUploadQueueEntry) {
  memoryQueue.set(entry.localId, entry);
  if (isWeapp()) {
    Taro.setStorageSync(`runew_media_upload:${entry.localId}`, entry);
  } else if (canUseIndexedDb()) {
    await idbPut('queue', entry.localId, entry);
  } else {
    await putOpfsJson('queue', entry.localId, entry);
  }
}

async function deleteQueueEntry(localId: string) {
  memoryQueue.delete(localId);
  if (isWeapp()) {
    Taro.removeStorageSync(`runew_media_upload:${localId}`);
  } else if (canUseIndexedDb()) {
    await idbDelete('queue', localId);
  } else {
    await deleteOpfsJson('queue', localId);
  }
}

async function saveMiniProgramMedia(
  tempFilePath: string,
  mimeType: string,
): Promise<DurableLocalMedia> {
  const localId = createUlid();
  const fs = Taro.getFileSystemManager();
  const filename = tempFilePath.split('/').pop() || `${localId}.bin`;
  const ext = filename.includes('.') ? filename.split('.').pop() : 'bin';
  const durableDir = `${Taro.env.USER_DATA_PATH}/media`;
  try {
    fs.accessSync(durableDir);
  } catch {
    fs.mkdirSync(durableDir, true);
  }

  const durablePath = `${durableDir}/${localId}.${ext}`;
  const uploadingPath = `${durablePath}.uploading`;
  try {
    await new Promise<void>((resolve, reject) => {
      fs.copyFile({
        srcPath: tempFilePath,
        destPath: uploadingPath,
        success: () => resolve(),
        fail: (error) => reject(new Error(`微信持久化存储失败: ${error.errMsg}`)),
      });
    });
    fs.renameSync(uploadingPath, durablePath);
  } catch (error) {
    try {
      fs.unlinkSync(uploadingPath);
    } catch {
      // The temporary copy may not have been created.
    }
    throw error;
  }
  const stat = fs.statSync(durablePath) as Taro.Stats;
  const sizeBytes = typeof stat.size === 'number' ? stat.size : 0;
  if (sizeBytes <= 0) throw new Error('本地媒体文件为空');

  const record: DurableLocalMedia = {
    localId,
    durablePath,
    storage: 'WEAPP_USER_DATA_PATH',
    originalFilename: filename,
    mimeType: mimeType || 'application/octet-stream',
    sizeBytes,
    createdAt: Date.now(),
  };
  await putRecord(record);
  return record;
}

async function saveH5Media(
  file: File | Blob,
  mimeType: string,
): Promise<DurableLocalMedia> {
  if (file.size <= 0) throw new Error('本地媒体文件为空');
  const localId = createUlid();
  const filename =
    typeof File !== 'undefined' && file instanceof File && file.name
      ? file.name
      : `media_${localId}`;
  const resolvedMimeType = mimeType || file.type || 'application/octet-stream';

  if (canUseOpfs()) {
    let opfsPath: string | undefined;
    try {
      const root = await navigator.storage.getDirectory();
      const mediaDir = await root.getDirectoryHandle('media', { create: true });
      const safeFilename = filename.replace(/[\\/\0]/g, '_');
      opfsPath = `${localId}_${safeFilename}`;
      const fileHandle = await mediaDir.getFileHandle(opfsPath, {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();
      const record: DurableLocalMedia = {
        localId,
        durablePath: `opfs://media/${opfsPath}`,
        storage: 'OPFS',
        originalFilename: filename,
        mimeType: resolvedMimeType,
        sizeBytes: file.size,
        createdAt: Date.now(),
      };
      await putRecord(record);
      return record;
    } catch {
      if (opfsPath) {
        const root = await navigator.storage.getDirectory().catch(() => undefined);
        const mediaDir = await root?.getDirectoryHandle('media').catch(() => undefined);
        await mediaDir?.removeEntry(opfsPath).catch(() => undefined);
      }
      // Continue to the persistent IndexedDB Blob fallback.
    }
  }

  // A memory map is only a process cache. Do not report a durable save when
  // the browser has neither OPFS nor IndexedDB to survive refresh/restart.
  if (!canUseIndexedDb()) {
    throw new Error('当前浏览器不支持可靠的本地媒体保存');
  }

  await putBlob(localId, file);
  const record: DurableLocalMedia = {
    localId,
    durablePath: `idb://media/${localId}`,
    storage: 'INDEXED_DB',
    originalFilename: filename,
    mimeType: resolvedMimeType,
    sizeBytes: file.size,
    createdAt: Date.now(),
  };
  await putRecord(record);
  return record;
}

/** Persist first; only callers of this function may show a durable-save success state. */
export async function saveDurableLocalMedia(
  input: string | File | Blob,
  mimeType = 'image/jpeg',
): Promise<DurableLocalMedia> {
  if (isWeapp() && typeof input === 'string')
    return saveMiniProgramMedia(input, mimeType);
  if (typeof input === 'string') {
    const existingId = input.startsWith('opfs://')
      ? input.split('/').pop()?.split('_')[0]
      : input.startsWith('idb://')
        ? input.split('/').pop()
        : undefined;
    if (existingId) {
      const existing = await getRecord(existingId);
      if (existing) return existing;
    }
    throw new Error('H5 媒体必须通过 File/Blob 持久化保存，不能把临时路径当作永久文件');
  }
  return saveH5Media(input, mimeType);
}

export async function getDurableMediaMetadata(localId: string) {
  return getRecord(localId);
}

export async function readDurableLocalMedia(
  source: DurableLocalMedia | string,
  offset = 0,
  length?: number,
): Promise<ArrayBuffer> {
  const record = typeof source === 'string' ? await getRecordFromPath(source) : source;
  if (record.storage === 'WEAPP_USER_DATA_PATH') {
    const fs = Taro.getFileSystemManager();
    const byteLength = length ?? Math.max(0, record.sizeBytes - offset);
    // Omitting encoding is required here: `binary` returns a string and corrupts
    // bytes above 0x7f when a chunk is converted through TextEncoder.
    const value = fs.readFileSync(record.durablePath, undefined, offset, byteLength);
    if (typeof value === 'string') throw new Error('微信媒体二进制读取格式异常');
    return value;
  }
  const blob =
    record.storage === 'INDEXED_DB'
      ? await getBlob(record.localId)
      : await getOpfsBlob(record.durablePath);
  if (!blob) throw new Error('本地媒体文件不存在，未安全保存');
  return blob
    .slice(offset, length === undefined ? undefined : offset + length)
    .arrayBuffer();
}

async function getRecordFromPath(path: string) {
  const localId = path.startsWith('idb://')
    ? path.split('/').pop()
    : path.startsWith('opfs://')
      ? path.split('/').pop()?.split('_')[0]
      : undefined;
  if (!localId) throw new Error('不是可恢复的持久媒体路径');
  const record = await getRecord(localId);
  if (!record) throw new Error('本地媒体元数据不存在');
  return record;
}

async function getOpfsBlob(durablePath: string) {
  if (!canUseOpfs()) return undefined;
  const filename = durablePath.split('/').pop();
  if (!filename) return undefined;
  const root = await navigator.storage.getDirectory();
  const mediaDir = await root.getDirectoryHandle('media');
  const fileHandle = await mediaDir.getFileHandle(filename);
  return fileHandle.getFile();
}

/** Object URLs are created only for a visible preview and must be revoked by the caller. */
export async function createEphemeralPreviewUrl(source: DurableLocalMedia) {
  if (source.storage === 'WEAPP_USER_DATA_PATH') return source.durablePath;
  const blob =
    source.storage === 'INDEXED_DB'
      ? await getBlob(source.localId)
      : await getOpfsBlob(source.durablePath);
  if (!blob) throw new Error('预览文件不存在');
  return URL.createObjectURL(blob);
}

export async function enqueueMediaUpload(
  media: DurableLocalMedia,
  options: Omit<
    MediaUploadQueueEntry,
    | 'localId'
    | 'durablePath'
    | 'originalFilename'
    | 'mimeType'
    | 'sizeBytes'
    | 'status'
    | 'attempts'
    | 'updatedAt'
  >,
) {
  const entry: MediaUploadQueueEntry = {
    localId: media.localId,
    durablePath: media.durablePath,
    originalFilename: media.originalFilename,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    status: 'PENDING',
    attempts: 0,
    updatedAt: Date.now(),
    ...options,
  };
  await putQueueEntry(entry);
  return entry;
}

export async function updateMediaUploadQueue(
  localId: string,
  patch: Partial<MediaUploadQueueEntry>,
) {
  const current = await getMediaUploadQueueEntry(localId);
  if (!current) return undefined;
  const next = { ...current, ...patch, updatedAt: Date.now() };
  await putQueueEntry(next);
  return next;
}

export async function getMediaUploadQueueEntry(localId: string) {
  const memoryEntry = memoryQueue.get(localId);
  if (memoryEntry) return memoryEntry;
  if (isWeapp()) {
    const entry = Taro.getStorageSync(`runew_media_upload:${localId}`) as
      MediaUploadQueueEntry | undefined;
    if (entry) memoryQueue.set(localId, entry);
    return entry;
  }
  if (canUseIndexedDb()) {
    const entry = await idbGet<MediaUploadQueueEntry>('queue', localId);
    if (entry) memoryQueue.set(localId, entry);
    return entry;
  }
  return undefined;
}

export async function listMediaUploadQueue() {
  if (isWeapp()) {
    const info = Taro.getStorageInfoSync();
    const entries = info.keys
      .filter((key) => key.startsWith('runew_media_upload:'))
      .map((key) => Taro.getStorageSync(key) as MediaUploadQueueEntry)
      .filter(Boolean);
    entries.forEach((entry) => memoryQueue.set(entry.localId, entry));
    return entries;
  }
  const entries = canUseIndexedDb()
    ? await idbGetAll<MediaUploadQueueEntry>('queue')
    : await listOpfsJson<MediaUploadQueueEntry>('queue');
  entries.forEach((entry) => memoryQueue.set(entry.localId, entry));
  return [...memoryQueue.values()];
}

export async function removeMediaUploadQueueEntry(localId: string) {
  await deleteQueueEntry(localId);
}
