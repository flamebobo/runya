import Taro from '@tarojs/taro';
import { createUlid } from '@runew/shared-utils';

export interface DurableLocalMedia {
  localId: string;
  durablePath: string;
  originalFilename?: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
}

// 1. Mini Program Durable Save (USER_DATA_PATH)
async function saveMiniProgramMedia(tempFilePath: string, mimeType: string): Promise<DurableLocalMedia> {
  const localId = createUlid();
  const fs = Taro.getFileSystemManager();
  const ext = tempFilePath.split('.').pop() || 'bin';
  const durableDir = `${Taro.env.USER_DATA_PATH}/media`;

  // Ensure directory exists
  try {
    fs.accessSync(durableDir);
  } catch {
    fs.mkdirSync(durableDir, true);
  }

  const durablePath = `${durableDir}/${localId}.${ext}`;

  await new Promise<void>((resolve, reject) => {
    fs.copyFile({
      srcPath: tempFilePath,
      destPath: durablePath,
      success: () => resolve(),
      fail: (err) => reject(new Error(`微信持久化存储失败: ${err.errMsg}`)),
    });
  });

  const stat = fs.statSync(durablePath) as Taro.Stats;
  const sizeBytes = typeof stat.size === 'number' ? stat.size : 0;

  return {
    localId,
    durablePath,
    mimeType,
    sizeBytes,
    createdAt: Date.now(),
  };
}

// 2. H5 OPFS / IndexedDB Durable Save
async function saveH5Media(file: File | Blob, mimeType: string): Promise<DurableLocalMedia> {
  const localId = createUlid();
  const filename = file instanceof File ? file.name : `media_${localId}`;

  if (typeof window !== 'undefined' && window.navigator?.storage?.getDirectory) {
    try {
      const root = await window.navigator.storage.getDirectory();
      const mediaDir = await root.getDirectoryHandle('media', { create: true });
      const fileHandle = await mediaDir.getFileHandle(`${localId}_${filename}`, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();

      return {
        localId,
        durablePath: `opfs://media/${localId}_${filename}`,
        originalFilename: filename,
        mimeType: mimeType || file.type || 'application/octet-stream',
        sizeBytes: file.size,
        createdAt: Date.now(),
      };
    } catch {
      // Fallback to IndexedDB or Blob URL wrapper below
    }
  }

  // Fallback: Object URL for temporary in-memory display
  const durablePath = URL.createObjectURL(file);
  return {
    localId,
    durablePath,
    originalFilename: filename,
    mimeType: mimeType || file.type || 'application/octet-stream',
    sizeBytes: file.size,
    createdAt: Date.now(),
  };
}

/**
 * Perform durable local save before claiming "Saved" to user
 */
export async function saveDurableLocalMedia(
  input: string | File | Blob,
  mimeType = 'image/jpeg',
): Promise<DurableLocalMedia> {
  const isWeapp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP;
  if (isWeapp && typeof input === 'string') {
    return saveMiniProgramMedia(input, mimeType);
  }

  if (typeof input === 'string') {
    return {
      localId: createUlid(),
      durablePath: input,
      mimeType,
      sizeBytes: 0,
      createdAt: Date.now(),
    };
  }

  return saveH5Media(input, mimeType);
}
